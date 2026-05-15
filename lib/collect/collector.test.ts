import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { collectOnce, createCollectorRuntime } from "@/lib/collect/collector"
import type { CollectAdapter } from "@/lib/collect/adapters"
import { mockSourceEnvelopes } from "@/lib/collect/mock-snapshot"
import type { RuntimeCollectSource, VmsData } from "@/lib/collect/types"

describe("collector runtime", () => {
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("updates the in-memory snapshot from adapters", async () => {
    const attemptedAt = new Date("2026-05-12T01:00:00.000Z")
    const adapter: CollectAdapter<"vms"> = {
      source: "vms",
      timeoutMs: 100,
      async collect() {
        return {
          status: "ok",
          collectedAt: null,
          stale: false,
          error: null,
          data: {
            items: [
              {
                id: "vm-new",
                name: "new-vm",
                address: "192.168.50.10",
                state: "up",
                lastCheckedAt: attemptedAt.toISOString(),
              },
            ],
          } satisfies VmsData,
        }
      },
    }

    const runtime = createCollectorRuntime([adapter])

    await collectOnce(runtime, attemptedAt)

    expect(runtime.snapshot.vms.attemptedAt).toBe(attemptedAt.toISOString())
    expect(runtime.snapshot.vms.collectedAt).toBe(attemptedAt.toISOString())
    expect(runtime.snapshot.vms.data.items).toHaveLength(1)
    expect(runtime.snapshot.overview.data.generatedAt).toBe(
      attemptedAt.toISOString()
    )
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "[omni.collect] source=vms result=success status=ok"
      )
    )
    expect(consoleInfoSpy.mock.calls[0]?.[0]).toMatch(/durationMs=\d+/)
    expect(consoleInfoSpy.mock.calls[0]?.[0]).toContain(
      `attemptedAt=${attemptedAt.toISOString()}`
    )
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it("logs successful collection even when source status is progressing", async () => {
    const attemptedAt = new Date("2026-05-12T01:03:00.000Z")
    const adapter: CollectAdapter<"vms"> = {
      source: "vms",
      timeoutMs: 100,
      async collect() {
        return {
          status: "progressing",
          collectedAt: attemptedAt.toISOString(),
          stale: false,
          error: null,
          data: mockSourceEnvelopes.vms.data,
        }
      },
    }

    const runtime = createCollectorRuntime([adapter])

    await collectOnce(runtime, attemptedAt)

    expect(consoleInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "[omni.collect] source=vms result=success status=progressing"
      )
    )
    expect(consoleInfoSpy.mock.calls[0]?.[0]).toMatch(/durationMs=\d+/)
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it("logs adapter error results as collection failures", async () => {
    const attemptedAt = new Date("2026-05-12T01:04:00.000Z")
    const adapter: CollectAdapter<"gitlab"> = {
      source: "gitlab",
      timeoutMs: 100,
      async collect() {
        return {
          status: "permission_error",
          collectedAt: null,
          stale: false,
          error: {
            code: "PERMISSION_DENIED",
            message: "GITLAB_TOKEN is missing",
          },
          data: mockSourceEnvelopes.gitlab.data,
        }
      },
    }

    const runtime = createCollectorRuntime([adapter])

    await collectOnce(runtime, attemptedAt)

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '[omni.collect] source=gitlab result=failure status=permission_error stale=false'
      )
    )
    expect(consoleErrorSpy.mock.calls[0]?.[0]).toMatch(/durationMs=\d+/)
    expect(consoleErrorSpy.mock.calls[0]?.[0]).toContain(
      "errorCode=PERMISSION_DENIED"
    )
    expect(consoleErrorSpy.mock.calls[0]?.[0]).toContain(
      'errorMessage="GITLAB_TOKEN is missing"'
    )
    expect(consoleInfoSpy).not.toHaveBeenCalled()
  })

  it("keeps one source failure isolated from successful sources", async () => {
    const attemptedAt = new Date("2026-05-12T01:05:00.000Z")
    const vmsAdapter: CollectAdapter<"vms"> = {
      source: "vms",
      timeoutMs: 100,
      async collect() {
        return {
          status: "ok",
          collectedAt: null,
          stale: false,
          error: null,
          data: mockSourceEnvelopes.vms.data,
        }
      },
    }
    const gitlabAdapter: CollectAdapter<"gitlab"> = {
      source: "gitlab",
      timeoutMs: 100,
      async collect() {
        throw new Error("GitLab unavailable")
      },
    }

    const runtime = createCollectorRuntime([vmsAdapter, gitlabAdapter])
    const previousGitLabCollectedAt = runtime.snapshot.gitlab.collectedAt

    await collectOnce(runtime, attemptedAt)

    expect(runtime.snapshot.vms.status).toBe("ok")
    expect(runtime.snapshot.vms.attemptedAt).toBe(attemptedAt.toISOString())
    expect(runtime.snapshot.gitlab.status).toBe("stale")
    expect(runtime.snapshot.gitlab.attemptedAt).toBe(attemptedAt.toISOString())
    expect(runtime.snapshot.gitlab.collectedAt).toBe(previousGitLabCollectedAt)
    expect(runtime.snapshot.gitlab.error?.code).toBe("UNKNOWN_ERROR")
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining("[omni.collect] source=vms result=success")
    )
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[omni.collect] source=gitlab result=failure")
    )
    expect(consoleErrorSpy.mock.calls[0]?.[0]).toContain(
      "errorCode=UNKNOWN_ERROR"
    )
    expect(consoleErrorSpy.mock.calls[0]?.[0]).toContain(
      'errorMessage="GitLab unavailable"'
    )
  })

  it("marks timed-out sources stale while preserving last collected data", async () => {
    const attemptedAt = new Date("2026-05-12T01:10:00.000Z")
    const adapter: CollectAdapter<"kubernetes"> = {
      source: "kubernetes",
      timeoutMs: 1,
      collect: () => new Promise(() => undefined),
    }

    const runtime = createCollectorRuntime([
      adapter as CollectAdapter<RuntimeCollectSource>,
    ])
    const previousKubernetesData = runtime.snapshot.kubernetes.data
    const previousKubernetesCollectedAt =
      runtime.snapshot.kubernetes.collectedAt

    await collectOnce(runtime, attemptedAt)

    expect(runtime.snapshot.kubernetes.status).toBe("stale")
    expect(runtime.snapshot.kubernetes.error?.code).toBe("TIMEOUT")
    expect(runtime.snapshot.kubernetes.attemptedAt).toBe(
      attemptedAt.toISOString()
    )
    expect(runtime.snapshot.kubernetes.collectedAt).toBe(
      previousKubernetesCollectedAt
    )
    expect(runtime.snapshot.kubernetes.data).toBe(previousKubernetesData)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "[omni.collect] source=kubernetes result=failure status=stale"
      )
    )
    expect(consoleErrorSpy.mock.calls[0]?.[0]).toContain("errorCode=TIMEOUT")
  })
})
