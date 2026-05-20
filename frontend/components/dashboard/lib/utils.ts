import type { SourceStatus } from "@/lib/collect/types"
import type { DashboardSnapshot } from "./types"
import { createMockSnapshot, isMockMode } from "@/lib/mock"

function ensureArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : []
}

function normalizeSnapshot(snapshot: DashboardSnapshot): DashboardSnapshot {
  const kubernetesData = snapshot.kubernetes?.data
  const vmsData = snapshot.vms?.data
  const argocdData = snapshot.argocd?.data
  const gitlabData = snapshot.gitlab?.data
  const nexusData = snapshot.nexus?.data
  const overviewData = snapshot.overview?.data

  return {
    ...snapshot,
    overview: {
      ...snapshot.overview,
      data: {
        ...overviewData,
        health: overviewData?.health ?? "unknown",
        generatedAt: overviewData?.generatedAt ?? "",
        sources: ensureArray(overviewData?.sources),
      },
    },
    vms: {
      ...snapshot.vms,
      data: {
        ...vmsData,
        items: ensureArray(vmsData?.items),
      },
    },
    kubernetes: {
      ...snapshot.kubernetes,
      data: {
        name: kubernetesData?.name ?? "unconfigured",
        nodes: ensureArray(kubernetesData?.nodes),
        namespaces: ensureArray(kubernetesData?.namespaces),
        workloads: ensureArray(kubernetesData?.workloads),
        pods: kubernetesData?.pods ?? {
          total: 0,
          ready: 0,
          notReady: 0,
          restarting: 0,
        },
        services: kubernetesData?.services ?? { total: 0 },
        ingresses: kubernetesData?.ingresses ?? { total: 0, hosts: [] },
        pvcs: kubernetesData?.pvcs ?? { total: 0, bound: 0, pending: 0 },
      },
    },
    argocd: {
      ...snapshot.argocd,
      data: {
        ...argocdData,
        applications: ensureArray(argocdData?.applications),
      },
    },
    gitlab: {
      ...snapshot.gitlab,
      data: {
        ...gitlabData,
        projects: ensureArray(gitlabData?.projects),
      },
    },
    nexus: {
      ...snapshot.nexus,
      data: {
        ...nexusData,
        items: ensureArray(nexusData?.items),
        url: nexusData?.url ?? "",
        reachable: nexusData?.reachable ?? false,
        httpStatus: nexusData?.httpStatus ?? null,
        checkedAt: nexusData?.checkedAt ?? "",
      },
    },
  }
}

export async function loadSnapshot(force = false): Promise<DashboardSnapshot> {
  if (isMockMode()) {
    return createMockSnapshot()
  }
  const url = force ? "/api/collect/snapshot?force=true" : "/api/collect/snapshot"
  const response = await fetch(url, { cache: "no-store" })

  if (!response.ok) {
    throw new Error(`Collect snapshot API returned ${response.status}`)
  }

  const payload = (await response.json()) as DashboardSnapshot
  return normalizeSnapshot(payload)
}

export function badgeVariant(
  status: SourceStatus,
  stale?: boolean
): "destructive" | "secondary" | "outline" {
  if (status === "down") {
    return "destructive"
  }

  if (status === "ok" && !stale) {
    return "secondary"
  }

  return "outline"
}

export function statusColor(status: SourceStatus, stale?: boolean) {
  if (stale || status === "stale" || status === "timeout") {
    return "var(--status-warn)"
  }

  if (status === "ok") {
    return "var(--status-ok)"
  }

  if (status === "progressing") {
    return "var(--status-progress)"
  }

  if (status === "down" || status === "permission_error") {
    return "var(--status-down)"
  }

  return "var(--status-muted)"
}

export function formatDateTime(value: string | null) {
  if (!value) {
    return "not collected"
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value))
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value))
}
