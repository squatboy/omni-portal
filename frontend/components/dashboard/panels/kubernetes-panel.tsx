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
import {
  ResourceBar,
  WorkloadRolloutDetail,
  WorkloadStatusBadge,
} from "../shared/common"
import { StatusBadge } from "../shared/status-badge"

export function KubernetesPanel({
  envelope,
}: {
  envelope: CollectEnvelope<KubernetesData, "kubernetes">
}) {
  const data = envelope.data

  return (
    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <Card size="sm" className="rounded-md">
        <CardHeader>
          <CardTitle>Node Resources</CardTitle>
          <CardDescription>{data.clusterName} cluster</CardDescription>
          <CardAction>
            <StatusBadge status={envelope.status} stale={envelope.stale} />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {data.nodes.map((node) => (
            <div key={node.name} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {node.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {node.ready ? "Ready" : "NotReady"}
                  </div>
                </div>
                <StatusBadge status={node.ready ? "ok" : "down"} />
              </div>
              <ResourceBar
                label="CPU"
                value={node.cpuUsagePercent}
                fallback="n/a"
              />
              <ResourceBar
                label="Memory"
                value={node.memoryUsagePercent}
                fallback="n/a"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card size="sm" className="rounded-md">
        <CardHeader>
          <CardTitle>Workloads</CardTitle>
          <CardDescription>
            Pods {data.pods.ready}/{data.pods.total} ready, PVC{" "}
            {data.pvcs.bound}/{data.pvcs.total} bound
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Namespace</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Ready</TableHead>
                <TableHead>Rollout</TableHead>
                <TableHead>Restarts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.workloads.map((workload) => (
                <TableRow key={`${workload.namespace}-${workload.name}`}>
                  <TableCell className="font-mono text-xs">
                    {workload.namespace}
                  </TableCell>
                  <TableCell>
                    <div className="flex min-w-48 flex-col gap-1">
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
    </div>
  )
}
