import type { SourceStatus } from "@/lib/collect/types"
import type { DashboardSnapshot } from "./types"

export async function loadSnapshot(force = false): Promise<DashboardSnapshot> {
  const url = force ? "/api/collect/snapshot?force=true" : "/api/collect/snapshot"
  const response = await fetch(url, { cache: "no-store" })

  if (!response.ok) {
    throw new Error(`Collect snapshot API returned ${response.status}`)
  }

  return response.json() as Promise<DashboardSnapshot>
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
