import { getInventoryConfig } from "@/lib/collect/config"
import type { CollectAdapterResult } from "@/lib/collect/adapters"
import type { ArgoCdApplication, CollectErrorCode } from "@/lib/collect/types"

type ArgoApplicationListResponse = {
  items?: ArgoApplicationItem[]
}

type ArgoApplicationItem = {
  metadata?: {
    name?: string
    namespace?: string
  }
  status?: {
    sync?: {
      status?: string
      revision?: string
    }
    health?: {
      status?: string
    }
  }
}

export async function collectArgoCd(
  signal: AbortSignal
): Promise<CollectAdapterResult<"argocd">> {
  const config = getInventoryConfig()
  const baseUrl = config.argocd?.baseUrl?.replace(/\/$/, "") ?? ""
  const collectedAt = new Date().toISOString()

  if (!baseUrl) {
    return {
      status: "unknown",
      collectedAt,
      stale: false,
      error: {
        code: "UNKNOWN_ERROR",
        message: "Argo CD base URL not configured",
      },
      data: { applications: [] },
    }
  }

  const token = process.env.ARGOCD_TOKEN?.trim()
  if (!token) {
    return {
      status: "permission_error",
      collectedAt,
      stale: false,
      error: {
        code: "PERMISSION_DENIED",
        message: "ARGOCD_TOKEN is missing",
      },
      data: { applications: [] },
    }
  }

  try {
    const response = await fetch(`${baseUrl}/api/v1/applications`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal,
    })

    if (!response.ok) {
      return {
        status: response.status === 401 || response.status === 403 ? "permission_error" : "down",
        collectedAt,
        stale: false,
        error: {
          code:
            response.status === 401 || response.status === 403
              ? "PERMISSION_DENIED"
              : "CONNECTION_FAILED",
          message: `Argo CD API responded with status ${response.status}`,
        },
        data: { applications: [] },
      }
    }

    const payload = (await response.json()) as ArgoApplicationListResponse
    const applications = (payload.items ?? []).flatMap((item) =>
      toApplication(item, baseUrl)
    )

    return {
      status: "ok",
      collectedAt,
      stale: false,
      error: null,
      data: { applications },
    }
  } catch (error) {
    const mappedError = mapError(error)
    return {
      status: mappedError.code === "TIMEOUT" ? "timeout" : "down",
      collectedAt,
      stale: false,
      error: mappedError,
      data: { applications: [] },
    }
  }
}

function toApplication(
  item: ArgoApplicationItem,
  baseUrl: string
): ArgoCdApplication[] {
  const name = item.metadata?.name
  const namespace = item.metadata?.namespace

  if (!name || !namespace) {
    return []
  }

  return [
    {
      name,
      namespace,
      syncStatus: toSyncStatus(item.status?.sync?.status),
      healthStatus: toHealthStatus(item.status?.health?.status),
      revision: item.status?.sync?.revision ?? null,
      link: `${baseUrl}/applications/${encodeURIComponent(name)}`,
    },
  ]
}

function toSyncStatus(value?: string): ArgoCdApplication["syncStatus"] {
  if (value === "Synced" || value === "OutOfSync") {
    return value
  }
  return "Unknown"
}

function toHealthStatus(value?: string): ArgoCdApplication["healthStatus"] {
  if (
    value === "Healthy" ||
    value === "Progressing" ||
    value === "Degraded"
  ) {
    return value
  }
  return "Unknown"
}

function mapError(error: unknown): { code: CollectErrorCode; message: string } {
  if (error instanceof Error && error.name === "AbortError") {
    return {
      code: "TIMEOUT",
      message: "Argo CD API request timed out",
    }
  }

  return {
    code: "CONNECTION_FAILED",
    message:
      error instanceof Error ? error.message : "Argo CD API request failed",
  }
}
