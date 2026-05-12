import { describe, expect, it } from "vitest"

import { collectOnce, createCollectorRuntime } from "@/lib/collect/collector"
import type { CollectAdapter } from "@/lib/collect/adapters"
import { mockSourceEnvelopes } from "@/lib/collect/mock-snapshot"
import type { RuntimeCollectSource, VmsData } from "@/lib/collect/types"

describe("collector runtime", () => {
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
  })
})
