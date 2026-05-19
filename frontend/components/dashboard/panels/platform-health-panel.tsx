import * as React from "react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
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
import type { CollectEnvelope, CollectSource } from "@/lib/collect/types"
import { sourceLabels } from "../lib/constants"
import type { DashboardSnapshot, SourceKey } from "../lib/types"
import { formatDateTime } from "../lib/utils"
import { StatusDot } from "../shared/status-badge"

export function PlatformHealthPanel({ snapshot }: { snapshot: DashboardSnapshot }) {
  const sources: {
    key: SourceKey
    envelope: CollectEnvelope<unknown, CollectSource>
  }[] = [
    { key: "kubernetes", envelope: snapshot.kubernetes },
    { key: "vms", envelope: snapshot.vms },
    { key: "argocd", envelope: snapshot.argocd },
    { key: "gitlab", envelope: snapshot.gitlab },
    { key: "nexus", envelope: snapshot.nexus },
  ]

  return (
    <Card size="sm" className="rounded-md">
      <CardHeader>
        <CardTitle>Platform API Connectivity</CardTitle>
        <CardDescription>
          Pure reachability status (excluding item health)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Service</TableHead>
              <TableHead>API Status</TableHead>
              <TableHead>Response Time / Last Check</TableHead>
              <TableHead>Message</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources.map(({ key, envelope }) => {
              const isAlive =
                envelope.status === "ok" ||
                envelope.status === "progressing" ||
                envelope.status === "stale"
              return (
                <TableRow key={key}>
                  <TableCell className="font-medium">
                    {sourceLabels[key]}
                  </TableCell>
                  <TableCell>
                    <Badge variant={isAlive ? "secondary" : "destructive"}>
                      <StatusDot status={isAlive ? "ok" : "down"} />
                      {isAlive ? "REACHABLE" : envelope.status.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatDateTime(envelope.collectedAt)}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                    {envelope.error?.message ?? "Connection healthy"}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
