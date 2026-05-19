import * as React from "react"

import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { SourceStatus } from "@/lib/collect/types"
import { StatusDot } from "./status-badge"

export function MetricCard({
  title,
  value,
  detail,
  status,
  stale,
}: {
  title: string
  value: string
  detail: string
  status: SourceStatus
  stale?: boolean
}) {
  return (
    <Card size="sm" className="rounded-md">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardAction>
          <StatusDot status={status} stale={stale} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="font-mono text-3xl font-semibold tracking-normal">
          {value}
        </div>
        <div className="truncate text-xs text-muted-foreground">{detail}</div>
      </CardContent>
    </Card>
  )
}
