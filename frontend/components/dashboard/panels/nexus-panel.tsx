import * as React from "react"

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { CollectEnvelope, NexusData } from "@/lib/collect/types"
import { formatDateTime } from "../lib/utils"
import { Fact } from "../shared/common"
import { StatusBadge } from "../shared/status-badge"

export function NexusPanel({
  envelope,
}: {
  envelope: CollectEnvelope<NexusData, "nexus">
}) {
  return (
    <Card size="sm" className="max-w-3xl rounded-md">
      <CardHeader>
        <CardTitle>Nexus Availability</CardTitle>
        <CardDescription>{envelope.data.url}</CardDescription>
        <CardAction>
          <StatusBadge status={envelope.status} stale={envelope.stale} />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        <Fact
          label="Reachable"
          value={envelope.data.reachable ? "yes" : "no"}
        />
        <Fact
          label="HTTP"
          value={envelope.data.httpStatus?.toString() ?? "unknown"}
        />
        <Fact label="Checked" value={formatDateTime(envelope.data.checkedAt)} />
      </CardContent>
    </Card>
  )
}
