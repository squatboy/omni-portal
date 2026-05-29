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
import type {
  CollectEnvelope,
  GitHubData,
  SourceStatus,
} from "@/lib/collect/types"
import { formatDateTime } from "../lib/utils"
import { ExternalLinkButton } from "../shared/common"
import { StatusBadge } from "../shared/status-badge"

export function GitHubPanel({
  envelope,
}: {
  envelope: CollectEnvelope<GitHubData, "github">
}) {
  return (
    <Card size="sm" className="rounded-md">
      <CardHeader>
        <CardTitle>GitHub Repositories</CardTitle>
        <CardDescription>Repository commits and workflow runs</CardDescription>
        <CardAction>
          <StatusBadge status={envelope.status} stale={envelope.stale} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Repository</TableHead>
              <TableHead>Commit</TableHead>
              <TableHead>Workflow Run</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>Link</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {envelope.data.repositories.map((repository) => (
              <TableRow key={repository.fullName}>
                <TableCell>
                  <div className="flex min-w-52 flex-col gap-1">
                    <span className="truncate font-medium">
                      {repository.fullName}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex min-w-56 flex-col gap-1">
                    <span className="truncate">
                      {repository.latestCommit?.message ?? "No commit snapshot"}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {repository.latestCommit?.sha ?? "unknown"}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {repository.latestWorkflowRun ? (
                    <StatusBadge
                      status={workflowRunStatus(repository.latestWorkflowRun)}
                      label={
                        repository.latestWorkflowRun.conclusion ??
                        repository.latestWorkflowRun.status
                      }
                    />
                  ) : (
                    "-"
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {repository.latestWorkflowRun
                    ? formatDateTime(repository.latestWorkflowRun.updatedAt)
                    : "-"}
                </TableCell>
                <TableCell>
                  <ExternalLinkButton
                    href={repository.link || "#"}
                    label={repository.fullName}
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

function workflowRunStatus(
  run: NonNullable<GitHubData["repositories"][number]["latestWorkflowRun"]>
): SourceStatus {
  if (
    run.status === "queued" ||
    run.status === "in_progress" ||
    run.status === "waiting" ||
    run.status === "requested"
  ) {
    return "progressing"
  }
  if (
    run.conclusion === "failure" ||
    run.conclusion === "cancelled" ||
    run.conclusion === "timed_out" ||
    run.conclusion === "action_required"
  ) {
    return "stale"
  }
  return "ok"
}
