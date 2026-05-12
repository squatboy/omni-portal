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

import { collectNexus } from "@/lib/collect/nexus"

describe("collectNexus", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    testConfig = structuredClone(baseConfig)
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("returns unknown when nexus url is not configured", async () => {
    testConfig.nexus.url = ""

    const result = await collectNexus(new AbortController().signal)

    expect(result.status).toBe("unknown")
    expect(result.error?.code).toBe("UNKNOWN_ERROR")
    expect(result.data.reachable).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("checks only nexus connectivity with HEAD request", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    const result = await collectNexus(new AbortController().signal)

    expect(result.status).toBe("ok")
    expect(result.error).toBeNull()
    expect(result.data.reachable).toBe(true)
    expect(result.data.httpStatus).toBe(204)
    expect(result.data.url).toBe(testEnv.nexusUrl)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      `${testEnv.nexusUrl}/service/rest/v1/status`,
      expect.objectContaining({ method: "HEAD" })
    )
  })

  it("maps abort errors to timeout status", async () => {
    const abortError = new Error("aborted")
    abortError.name = "AbortError"
    fetchMock.mockRejectedValue(abortError)

    const result = await collectNexus(new AbortController().signal)

    expect(result.status).toBe("timeout")
    expect(result.error?.code).toBe("TIMEOUT")
    expect(result.data.reachable).toBe(false)
  })

  it("maps generic request failures to down status", async () => {
    fetchMock.mockRejectedValue(new Error("network down"))

    const result = await collectNexus(new AbortController().signal)

    expect(result.status).toBe("down")
    expect(result.error?.code).toBe("CONNECTION_FAILED")
    expect(result.data.reachable).toBe(false)
  })
})
