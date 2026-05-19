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
import type { CollectEnvelope, VmsData } from "@/lib/collect/types"
import { formatDateTime } from "../lib/utils"
import { StatusBadge } from "../shared/status-badge"

export function VmPanel({ envelope }: { envelope: CollectEnvelope<VmsData, "vms"> }) {
  return (
    <Card size="sm" className="rounded-md">
      <CardHeader>
        <CardTitle>VM Inventory</CardTitle>
        <CardDescription>Ping-based reachability</CardDescription>
        <CardAction>
          <StatusBadge status={envelope.status} stale={envelope.stale} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last check</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {envelope.data.items.map((vm) => (
              <TableRow key={vm.id}>
                <TableCell>
                  <div className="flex min-w-44 flex-col gap-1">
                    <span className="truncate font-medium">{vm.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {vm.description ?? "No description"}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="font-mono">{vm.address}</TableCell>
                <TableCell>
                  <StatusBadge
                    status={vm.state === "up" ? "ok" : vm.state}
                    label={vm.state}
                  />
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {formatDateTime(vm.lastCheckedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
