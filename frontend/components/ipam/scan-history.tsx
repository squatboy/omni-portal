"use client"

import * as React from "react"
import { ChevronRight, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { api } from "@/lib/api"
import type {
  IPAMAddressStatus,
  IPAMScanHistory,
  IPAMScanHistoryChange,
  IPAMScanHistoryDetail,
} from "@/lib/types"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmptyLine, formatNullableTime, ReadOnlyRow, StatusBadge } from "./shared"

function ScanStatusBadge({ status }: { status: IPAMScanHistory["status"] }) {
  return (
    <Badge variant={status === "failed" ? "destructive" : "secondary"}>
      {status}
    </Badge>
  )
}

function HistoryCountBadge({
  value,
  label,
}: {
  value?: number | null
  label: IPAMAddressStatus
}) {
  if (value === null || value === undefined) {
    return <Badge variant="outline">-</Badge>
  }
  return <StatusBadge status={label} count={value} />
}

function ScanHistoryChangesTable({
  changes,
}: {
  changes: IPAMScanHistoryChange[]
}) {
  if (changes.length === 0) {
    return <EmptyLine label="No status changes." />
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Address</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Last seen</TableHead>
          <TableHead>Failures</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {changes.map((change) => (
          <TableRow key={change.id}>
            <TableCell className="font-mono">{change.address}</TableCell>
            <TableCell>
              <span className="flex items-center gap-2">
                <StatusBadge status={change.previousStatus} count={null} />
                <span className="mx-2 text-muted-foreground">{"->"}</span>
                <StatusBadge status={change.currentStatus} count={null} />
              </span>
            </TableCell>
            <TableCell className="font-mono text-xs">
              <span className="flex items-center gap-2">
                <Badge variant="outline">
                  {formatNullableTime(change.previousLastSeenAt)}
                </Badge>
                <span className="mx-2 text-muted-foreground">{"->"}</span>
                <Badge variant="outline">
                  {formatNullableTime(change.currentLastSeenAt)}
                </Badge>
              </span>
            </TableCell>
            <TableCell className="font-mono">
              <span className="flex items-center gap-2">
                <Badge variant="outline">
                  {change.previousConsecutiveFailures}
                </Badge>
                <span className="mx-2 text-muted-foreground">{"->"}</span>
                <Badge variant="outline">
                  {change.currentConsecutiveFailures}
                </Badge>
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function IPAMScanHistoryPanel() {
  const [items, setItems] = React.useState<IPAMScanHistory[]>([])
  const [details, setDetails] = React.useState<
    Record<string, IPAMScanHistoryDetail>
  >({})
  const [expandedId, setExpandedId] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const loadHistory = React.useCallback(async () => {
    setRefreshing(true)
    try {
      const nextItems = await api.listIPAMScanHistory(20)
      setItems(nextItems)
      setError(null)
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Scan history load failed."
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  React.useEffect(() => {
    const id = window.setTimeout(() => {
      void loadHistory()
    }, 0)
    return () => window.clearTimeout(id)
  }, [loadHistory])

  async function toggleHistory(item: IPAMScanHistory) {
    if (expandedId === item.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(item.id)
    if (details[item.id]) return
    try {
      const detail = await api.getIPAMScanHistory(item.id)
      setDetails((prev) => ({ ...prev, [item.id]: detail }))
    } catch (detailError) {
      toast.error(
        detailError instanceof Error
          ? detailError.message
          : "Scan history detail load failed."
      )
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scan History</CardTitle>
        <CardDescription>
          Recent scan summaries and IP status transitions.
        </CardDescription>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => void loadHistory()}
          >
            <Loader2
              data-icon="inline-start"
              className={cn(
                !refreshing && "hidden",
                refreshing && "animate-spin"
              )}
            />
            Refresh
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error ? <Badge variant="destructive">{error}</Badge> : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subnet</TableHead>
              <TableHead>Scan time</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Used</TableHead>
              <TableHead>Offline</TableHead>
              <TableHead>Free</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const detail = details[item.id]
              const expanded = expandedId === item.id
              return (
                <React.Fragment key={item.id}>
                  <TableRow>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Collapsible open={expanded}>
                          <CollapsibleTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Toggle ${item.subnetName} scan history`}
                              onClick={() => void toggleHistory(item)}
                            >
                              <ChevronRight
                                data-icon="inline-start"
                                className={cn(
                                  "transition-transform",
                                  expanded && "rotate-90"
                                )}
                              />
                            </Button>
                          </CollapsibleTrigger>
                        </Collapsible>
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {item.subnetName}
                          </div>
                          <div className="font-mono text-xs text-muted-foreground">
                            {item.subnetCidr}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {formatNullableTime(item.completedAt)}
                    </TableCell>
                    <TableCell>
                      <ScanStatusBadge status={item.status} />
                    </TableCell>
                    <TableCell>
                      <HistoryCountBadge value={item.used} label="used" />
                    </TableCell>
                    <TableCell>
                      <HistoryCountBadge
                        value={item.offline}
                        label="offline"
                      />
                    </TableCell>
                    <TableCell>
                      <HistoryCountBadge value={item.free} label="free" />
                    </TableCell>
                  </TableRow>
                  {expanded ? (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <Collapsible open={expanded}>
                          <CollapsibleContent className="flex flex-col gap-3 py-2">
                            <div className="grid gap-2 text-sm md:grid-cols-6">
                              <ReadOnlyRow
                                label="Started"
                                value={formatNullableTime(item.startedAt)}
                                className="md:col-span-2"
                              />
                              <ReadOnlyRow
                                label="Completed"
                                value={formatNullableTime(item.completedAt)}
                                className="md:col-span-2"
                              />
                              <ReadOnlyRow
                                label="Total"
                                value={
                                  item.total === null ||
                                  item.total === undefined
                                    ? "-"
                                    : String(item.total)
                                }
                                className="md:col-span-1"
                              />
                              <ReadOnlyRow
                                label="Changes"
                                value={
                                  detail
                                    ? String(detail.changes.length)
                                    : "--"
                                }
                                className="md:col-span-1"
                              />
                            </div>
                            {item.error ? (
                              <Badge variant="destructive">
                                {item.error}
                              </Badge>
                            ) : null}
                            {detail ? (
                              <ScanHistoryChangesTable
                                changes={detail.changes}
                              />
                            ) : (
                              <EmptyLine label="Loading changes." />
                            )}
                          </CollapsibleContent>
                        </Collapsible>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </React.Fragment>
              )
            })}
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <EmptyLine
                    label={
                      loading ? "Loading scan history." : "No scan history."
                    }
                  />
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
