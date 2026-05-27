"use client"

import * as React from "react"

import type { IPAMAddressStatus } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"

export function StatusBadge({
  status,
  count,
}: {
  status: IPAMAddressStatus
  count: number | null
}) {
  return (
    <Badge
      variant={
        status === "offline"
          ? "destructive"
          : status === "used"
            ? "secondary"
            : status === "reserved"
              ? "secondary"
              : "outline"
      }
      className={cn(
        status === "used" &&
          "border-[color:color-mix(in_oklch,var(--status-ok)_45%,transparent)] bg-[color:color-mix(in_oklch,var(--status-ok)_14%,transparent)] text-[color:var(--status-ok)]",
        status === "reserved" &&
          "border-[color:color-mix(in_oklch,var(--status-warn)_45%,transparent)] bg-[color:color-mix(in_oklch,var(--status-warn)_14%,transparent)] text-[color:var(--status-warn)]"
      )}
    >
      {status}
      {count === null ? null : ` ${count}`}
    </Badge>
  )
}

export function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  const id = React.useId()
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {React.isValidElement<{ id?: string }>(children)
        ? React.cloneElement(children, { id })
        : children}
    </div>
  )
}

export function ReadOnlyRow({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2 text-xs",
        className
      )}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-mono">{value}</span>
    </div>
  )
}

export function EmptyLine({ label }: { label: string }) {
  return <div className="py-3 text-center text-muted-foreground">{label}</div>
}

export function formatNullableTime(value?: string | null) {
  if (!value) return "-"
  return new Date(value).toLocaleString()
}
