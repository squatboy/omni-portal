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
import { sourceLabels } from "../lib/constants"
import type { DashboardSnapshot } from "../lib/types"
import { formatDateTime } from "../lib/utils"
import {
  ExternalLinkButton,
  WorkloadRolloutDetail,
  WorkloadStatusBadge,
} from "../shared/common"
import { StatusBadge, StatusDot } from "../shared/status-badge"

export function OverviewPanel({ snapshot }: { snapshot: DashboardSnapshot }) {
  const workloads = snapshot.kubernetes.data.workloads
  const projects = snapshot.gitlab.data.projects

  return (
    <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
      <Card size="sm" className="rounded-md">
        <CardHeader>
          <CardTitle>Workload Readiness</CardTitle>
          <CardDescription>
            {snapshot.kubernetes.data.clusterName} cluster snapshot
          </CardDescription>
          <CardAction>
            <StatusBadge
              status={snapshot.kubernetes.status}
              stale={snapshot.kubernetes.stale}
            />
          </CardAction>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Namespace</TableHead>
                <TableHead>Workload</TableHead>
                <TableHead>Ready</TableHead>
                <TableHead>Rollout</TableHead>
                <TableHead>Restarts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workloads.map((workload) => (
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

      <div className="flex flex-col gap-4">
        <SourceHealthCard snapshot={snapshot} />
        <Card size="sm" className="rounded-md">
          <CardHeader>
            <CardTitle>CI/CD Feed</CardTitle>
            <CardDescription>Latest app repo signals</CardDescription>
            <CardAction>
              <StatusBadge
                status={snapshot.gitlab.status}
                stale={snapshot.gitlab.stale}
              />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {projects.map((project) => (
              <div
                key={project.path}
                className="flex items-center justify-between gap-3 rounded-md border bg-background/60 p-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {project.name}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {project.latestCommit?.title ?? "No commit snapshot"}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge
                    status={
                      project.latestPipeline?.status === "success"
                        ? "ok"
                        : project.latestPipeline
                          ? "stale"
                          : "unknown"
                    }
                    label={project.latestPipeline?.status ?? "missing"}
                  />
                  <ExternalLinkButton
                    href={project.link || "#"}
                    label={project.name}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function SourceHealthCard({ snapshot }: { snapshot: DashboardSnapshot }) {
  return (
    <Card size="sm" className="rounded-md">
      <CardHeader>
        <CardTitle>Source Health</CardTitle>
        <CardDescription>Failure and stale states</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {snapshot.overview.data.sources.map((source) => (
          <div
            key={source.source}
            className="flex items-center justify-between gap-3 rounded-md border bg-background/60 p-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <StatusDot status={source.status} stale={source.stale} />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {sourceLabels[source.source]}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {source.error?.message ??
                    `Collected ${formatDateTime(source.collectedAt)}`}
                </div>
              </div>
            </div>
            <StatusBadge status={source.status} stale={source.stale} />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
