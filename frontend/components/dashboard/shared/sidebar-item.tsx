import * as React from "react"

import type { SourceStatus } from "@/lib/collect/types"
import { cn } from "@/lib/utils"
import { StatusDot } from "./status-badge"

export function SidebarItem({
  icon: Icon,
  label,
  active,
  status,
  stale,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  active?: boolean
  status?: SourceStatus
  stale?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="size-4 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      {status ? <StatusDot status={status} stale={stale} /> : null}
    </button>
  )
}
