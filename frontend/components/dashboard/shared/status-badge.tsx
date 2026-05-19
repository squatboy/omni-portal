import * as React from "react"

import { Badge } from "@/components/ui/badge"
import type { SourceStatus } from "@/lib/collect/types"
import { statusLabels } from "../lib/constants"
import { badgeVariant, statusColor } from "../lib/utils"

export function StatusDot({
  status,
  stale,
}: {
  status: SourceStatus
  stale?: boolean
}) {
  const color = statusColor(status, stale)
  return (
    <span
      className="size-2 shrink-0 rounded-full"
      style={{
        backgroundColor: color,
        boxShadow: color !== "var(--status-muted)" ? `0 0 6px ${color}` : undefined,
      }}
    />
  )
}

export function StatusBadge({
  status,
  stale,
  label,
}: {
  status: SourceStatus
  stale?: boolean
  label?: string
}) {
  return (
    <Badge variant={badgeVariant(status, stale)}>
      <StatusDot status={status} stale={stale} />
      {label ?? (stale ? "STALE" : statusLabels[status])}
    </Badge>
  )
}
