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
import type { ArgoCdData, CollectEnvelope } from "@/lib/collect/types"
import { ExternalLinkButton } from "../shared/common"
import { StatusBadge } from "../shared/status-badge"

export function ArgoPanel({
  envelope,
}: {
  envelope: CollectEnvelope<ArgoCdData, "argocd">
}) {
  return (
    <Card size="sm" className="rounded-md">
      <CardHeader>
        <CardTitle>Argo CD Applications</CardTitle>
        <CardDescription>Full configured application set</CardDescription>
        <CardAction>
          <StatusBadge status={envelope.status} stale={envelope.stale} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Application</TableHead>
              <TableHead>Sync</TableHead>
              <TableHead>Health</TableHead>
              <TableHead>Revision</TableHead>
              <TableHead>Link</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {envelope.data.applications.map((app) => (
              <TableRow key={app.name}>
                <TableCell>
                  <div className="flex min-w-44 flex-col gap-1">
                    <span className="truncate font-medium">{app.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {app.namespace}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge
                    status={
                      app.syncStatus === "Synced"
                        ? "ok"
                        : app.healthStatus === "Progressing"
                          ? "progressing"
                          : "stale"
                    }
                    label={app.syncStatus}
                  />
                </TableCell>
                <TableCell>
                  <StatusBadge
                    status={
                      app.healthStatus === "Healthy"
                        ? "ok"
                        : app.healthStatus === "Progressing"
                          ? "progressing"
                          : "stale"
                    }
                    label={app.healthStatus}
                  />
                </TableCell>
                <TableCell className="font-mono">
                  {app.revision ?? "unknown"}
                </TableCell>
                <TableCell>
                  <ExternalLinkButton href={app.link} label={app.name} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
