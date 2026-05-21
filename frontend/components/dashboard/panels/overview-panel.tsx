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
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,1fr)]">
      <Card size="sm" className="min-w-0 rounded-md">
        <CardHeader>
          <CardTitle>Workload Readiness</CardTitle>
          <CardDescription>
            {snapshot.kubernetes.data.name} cluster snapshot
          </CardDescription>
          <CardAction>
            <StatusBadge
              status={snapshot.kubernetes.status}
              stale={snapshot.kubernetes.stale}
            />
          </CardAction>
        </CardHeader>
        <CardContent className="min-w-0">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[18%]">Namespace</TableHead>
                <TableHead className="w-[27%]">Workload</TableHead>
                <TableHead className="w-[17%]">Ready</TableHead>
                <TableHead className="w-[28%]">Rollout</TableHead>
                <TableHead className="w-[10%]">Restarts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workloads.map((workload) => (
                <TableRow key={`${workload.namespace}-${workload.name}`}>
                  <TableCell className="font-mono text-xs">
                    <span className="block truncate">{workload.namespace}</span>
                  </TableCell>
                  <TableCell className="min-w-0">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="truncate font-medium">
                        {workload.name}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {workload.kind}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <WorkloadStatusBadge workload={workload} />
                  </TableCell>
                  <TableCell className="whitespace-normal">
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
                  {project.latestPipeline ? (
                    <StatusBadge
                      status={
                        project.latestPipeline.status === "success"
                          ? "ok"
                          : "stale"
                      }
                      label={project.latestPipeline.status}
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
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
