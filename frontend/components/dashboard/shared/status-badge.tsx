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
  const isMuted = color === "var(--status-muted)"
  return (
    <span className="relative flex size-2 shrink-0">
      {!isMuted && (
        <span
          className="absolute inline-flex h-full w-full rounded-full animate-ping opacity-75"
          style={{ backgroundColor: color }}
        />
      )}
      <span
        className="relative inline-flex rounded-full size-2"
        style={{
          backgroundColor: color,
          boxShadow: !isMuted ? `0 0 6px ${color}` : undefined,
        }}
      />
    </span>
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
