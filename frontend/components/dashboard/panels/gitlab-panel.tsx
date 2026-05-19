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
import type { CollectEnvelope, GitLabData } from "@/lib/collect/types"
import { formatDateTime } from "../lib/utils"
import { ExternalLinkButton } from "../shared/common"
import { StatusBadge } from "../shared/status-badge"

export function GitLabPanel({
  envelope,
}: {
  envelope: CollectEnvelope<GitLabData, "gitlab">
}) {
  return (
    <Card size="sm" className="rounded-md">
      <CardHeader>
        <CardTitle>GitLab Projects</CardTitle>
        <CardDescription>App repositories only</CardDescription>
        <CardAction>
          <StatusBadge status={envelope.status} stale={envelope.stale} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Commit</TableHead>
              <TableHead>Pipeline</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>Link</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {envelope.data.projects.map((project) => (
              <TableRow key={project.path}>
                <TableCell>
                  <div className="flex min-w-52 flex-col gap-1">
                    <span className="truncate font-medium">{project.name}</span>
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      {project.path}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex min-w-56 flex-col gap-1">
                    <span className="truncate">
                      {project.latestCommit?.title ?? "No commit snapshot"}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {project.latestCommit?.sha ?? "unknown"}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
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
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {project.latestPipeline
                    ? formatDateTime(project.latestPipeline.updatedAt)
                    : "unknown"}
                </TableCell>
                <TableCell>
                  <ExternalLinkButton
                    href={project.link || "#"}
                    label={project.name}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
