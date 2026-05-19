import * as React from "react"

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { CollectEnvelope, KubernetesData } from "@/lib/collect/types"
import { WorkloadRolloutDetail, WorkloadStatusBadge } from "../shared/common"
import { StatusBadge } from "../shared/status-badge"

export function PodsPanel({
  envelope,
}: {
  envelope: CollectEnvelope<KubernetesData, "kubernetes">
}) {
  const data = envelope.data
  const workloads = data.appWorkloads

  return (
    <Card size="sm" className="rounded-md">
      <CardHeader>
        <CardTitle>Frontend / Backend Pods</CardTitle>
        <CardDescription>
          {workloads.length} app workloads in {data.namespaces.length} namespaces
        </CardDescription>
        <CardAction>
          <StatusBadge status={envelope.status} stale={envelope.stale} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Namespace</TableHead>
              <TableHead>App Workload</TableHead>
              <TableHead>Readiness</TableHead>
              <TableHead>Rollout</TableHead>
              <TableHead>Restart Count</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workloads.map((workload) => (
              <TableRow key={`${workload.namespace}-${workload.name}`}>
                <TableCell className="font-mono text-xs">
                  {workload.namespace}
                </TableCell>
                <TableCell>
                  <div className="flex min-w-56 flex-col gap-1">
                    <span className="truncate font-medium">
                      {workload.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {workload.kind}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <WorkloadStatusBadge workload={workload} />
                </TableCell>
                <TableCell>
                  <WorkloadRolloutDetail workload={workload} />
                </TableCell>
                <TableCell className="font-mono">
                  {workload.restartCount}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
