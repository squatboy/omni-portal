import { getInventoryConfig } from "@/lib/collect/config"
import { CollectErrorCode } from "@/lib/collect/types"
import { CollectAdapterResult } from "@/lib/collect/adapters"

export async function collectNexus(
  signal: AbortSignal
): Promise<CollectAdapterResult<"nexus">> {
  const config = getInventoryConfig()
  const nexusUrl = config.nexus?.url

  if (!nexusUrl) {
    return {
      status: "unknown",
      collectedAt: new Date().toISOString(),
      stale: false,
      error: { code: "UNKNOWN_ERROR", message: "Nexus URL not configured" },
      data: { url: "", reachable: false, httpStatus: null, checkedAt: new Date().toISOString() },
    }
  }

  const checkUrl = `${nexusUrl.replace(/\/$/, "")}/service/rest/v1/status`
  const now = new Date().toISOString()

  try {
    const response = await fetch(checkUrl, {
      method: "HEAD", // User mentioned curl -I
      signal,
    })

    const reachable = response.ok
    return {
      status: "ok",
      collectedAt: now,
      stale: false,
      error: null,
      data: {
        url: nexusUrl,
        reachable,
        httpStatus: response.status,
        checkedAt: now,
      },
    }
  } catch (err: unknown) {
    let errorCode: CollectErrorCode = "CONNECTION_FAILED"
    let message = err instanceof Error ? err.message : "Unknown error"

    if (err instanceof Error && err.name === "AbortError") {
      errorCode = "TIMEOUT"
      message = "Nexus health check timed out"
    }

    return {
      status: errorCode === "TIMEOUT" ? "timeout" : "down",
      collectedAt: now,
      stale: false,
      error: { code: errorCode, message },
      data: {
        url: nexusUrl,
        reachable: false,
        httpStatus: null,
        checkedAt: now,
      },
    }
  }
}
