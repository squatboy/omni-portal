import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CollectInventoryConfig } from "@/lib/collect/types"
import { testEnv } from "@/lib/collect/test-env"

const baseConfig: CollectInventoryConfig = {
  nexus: { url: testEnv.nexusUrl },
  gitlab: { baseUrl: testEnv.gitlabBaseUrl, projects: [] },
  argocd: { baseUrl: testEnv.argocdBaseUrl },
  kubernetes: {
    clusterName: "sth-prod-cluster",
    namespaces: [],
    appNamespaces: [],
  },
  vms: [],
}

let testConfig: CollectInventoryConfig = structuredClone(baseConfig)

vi.mock("@/lib/collect/config", () => ({
  getInventoryConfig: () => testConfig,
}))

import { collectArgoCd } from "@/lib/collect/argocd"

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("collectArgoCd", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    testConfig = structuredClone(baseConfig)
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch)
    delete process.env.ARGOCD_TOKEN
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.ARGOCD_TOKEN
  })

  it("returns permission_error when ARGOCD_TOKEN is missing", async () => {
    const result = await collectArgoCd(new AbortController().signal)

    expect(result.status).toBe("permission_error")
    expect(result.error?.code).toBe("PERMISSION_DENIED")
    expect(result.data.applications).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("collects Argo CD application sync and health states", async () => {
    process.env.ARGOCD_TOKEN = "argo-token"
    fetchMock.mockResolvedValue(
      jsonResponse({
        items: [
          {
            metadata: { name: "omni", namespace: "argocd" },
            status: {
              sync: { status: "Synced", revision: "abc1234" },
              health: { status: "Healthy" },
            },
          },
          {
            metadata: { name: "frontend", namespace: "argocd" },
            status: {
              sync: { status: "OutOfSync" },
              health: { status: "Progressing" },
            },
          },
        ],
      })
    )

    const result = await collectArgoCd(new AbortController().signal)

    expect(result.status).toBe("ok")
    expect(result.error).toBeNull()
    expect(result.data.applications).toHaveLength(2)
    expect(result.data.applications[0]).toMatchObject({
      name: "omni",
      namespace: "argocd",
      syncStatus: "Synced",
      healthStatus: "Healthy",
      revision: "abc1234",
    })
    expect(result.data.applications[0].link).toBe(
      `${testEnv.argocdBaseUrl}/applications/omni`
    )
    expect(result.data.applications[1]).toMatchObject({
      name: "frontend",
      syncStatus: "OutOfSync",
      healthStatus: "Progressing",
      revision: null,
    })
  })

  it("maps HTTP 403 to permission_error", async () => {
    process.env.ARGOCD_TOKEN = "argo-token"
    fetchMock.mockResolvedValue(new Response(null, { status: 403 }))

    const result = await collectArgoCd(new AbortController().signal)

    expect(result.status).toBe("permission_error")
    expect(result.error?.code).toBe("PERMISSION_DENIED")
  })

  it("maps abort errors to timeout status", async () => {
    process.env.ARGOCD_TOKEN = "argo-token"
    const abortError = new Error("aborted")
    abortError.name = "AbortError"
    fetchMock.mockRejectedValue(abortError)

    const result = await collectArgoCd(new AbortController().signal)

    expect(result.status).toBe("timeout")
    expect(result.error?.code).toBe("TIMEOUT")
  })
})
