"use client"

import * as React from "react"

import type { IPAMAddress, IPAMAddressStatus, IPAMSubnet } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Search } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  countIPAMAddresses,
  ipamAddressButtonLabel,
  sortIPAMAddressesByIPv4,
} from "./utils"
import { Field, formatNullableTime, ReadOnlyRow, StatusBadge } from "./shared"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { api } from "@/lib/api"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import { Label } from "@/components/ui/label"

export function SubnetAddressDetails({
  subnet,
  addresses,
  onOpenAddress,
}: {
  subnet: IPAMSubnet
  addresses: IPAMAddress[]
  onOpenAddress: (address: IPAMAddress) => void
}) {
  const counts = countIPAMAddresses(addresses)
  const sortedAddresses = sortIPAMAddressesByIPv4(addresses)
  const [isDialogOpen, setIsDialogOpen] = React.useState(false)

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle>{subnet.name} IP detail</CardTitle>
            <CardDescription>{subnet.cidr}</CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => setIsDialogOpen(true)}
          >
            <Search data-icon="inline-start" />
            Next Available IP
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Count</TableHead>
                <TableHead>Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(["used", "offline", "free", "reserved"] as IPAMAddressStatus[]).map(
                (status) => (
                  <TableRow key={status}>
                    <TableCell>
                      <StatusBadge status={status} count={null} />
                    </TableCell>
                    <TableCell className="font-mono">{counts[status]}</TableCell>
                    <TableCell className="font-mono">
                      {counts.total > 0
                        ? `${Math.round((counts[status] / counts.total) * 100)}%`
                        : "0%"}
                    </TableCell>
                  </TableRow>
                )
              )}
            </TableBody>
          </Table>
          <div className="grid grid-cols-[repeat(auto-fill,4rem)] gap-2">
            {sortedAddresses.map((address) => (
              <Button
                key={address.id}
                variant="outline"
                size="sm"
                className={cn(
                  "w-full justify-center font-mono",
                  address.status === "used" &&
                    "border-[color:color-mix(in_oklch,var(--status-ok)_45%,transparent)] bg-[color:color-mix(in_oklch,var(--status-ok)_14%,transparent)] text-[color:var(--status-ok)] hover:bg-[color:color-mix(in_oklch,var(--status-ok)_20%,transparent)]",
                  address.status === "reserved" &&
                    "border-[color:color-mix(in_oklch,var(--status-warn)_45%,transparent)] bg-[color:color-mix(in_oklch,var(--status-warn)_14%,transparent)] text-[color:var(--status-warn)] hover:bg-[color:color-mix(in_oklch,var(--status-warn)_20%,transparent)]",
                  address.status === "offline" &&
                    "border-destructive/30 bg-destructive/10 text-destructive",
                  address.status === "free" && "bg-muted"
                )}
                onClick={() => onOpenAddress(address)}
              >
                {ipamAddressButtonLabel(address.address)}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <NextAvailableIPDialog
        subnet={subnet}
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
      />
    </>
  )
}

export function AddressSheetPanel({
  address,
  canManage,
  onOpenChange,
  onSave,
}: {
  address: IPAMAddress
  canManage: boolean
  onOpenChange: (open: boolean) => void
  onSave: (address: IPAMAddress) => void
}) {
  const [form, setForm] = React.useState(address)

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{address.address}</SheetTitle>
          <SheetDescription>
            Status, scan timestamps, and manual metadata.
          </SheetDescription>
        </SheetHeader>
        <form
          className="flex flex-col gap-4 px-6"
          onSubmit={(event) => {
            event.preventDefault()
            onSave(form)
          }}
        >
          {canManage ? (
            <Field label="Status">
              <div className="flex gap-2 items-center">
                <Select
                  value={form.status}
                  onValueChange={(value: IPAMAddressStatus) =>
                    setForm((prev) => ({ ...prev, status: value }))
                  }
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">free</SelectItem>
                    <SelectItem value="used">used</SelectItem>
                    <SelectItem value="reserved">reserved</SelectItem>
                  </SelectContent>
                </Select>
                {form.isOverride && (
                  <Badge variant="outline" className="border-amber-500/40 text-amber-600 bg-amber-500/10">
                    Manual Override
                  </Badge>
                )}
              </div>
            </Field>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2 text-xs">
              <span className="text-muted-foreground">Status</span>
              <div className="flex items-center gap-2">
                <span className="font-mono">{form.status}</span>
                {form.isOverride && (
                  <Badge variant="outline" className="border-amber-500/40 text-amber-600 bg-amber-500/10 py-0 text-[10px]">
                    Manual Override
                  </Badge>
                )}
              </div>
            </div>
          )}
          <ReadOnlyRow
            label="Last scanned"
            value={formatNullableTime(form.lastScannedAt)}
          />
          <ReadOnlyRow
            label="Last seen"
            value={formatNullableTime(form.lastSeenAt)}
          />
          <ReadOnlyRow
            label="Failures"
            value={String(form.consecutiveFailures)}
          />
          <Field label="Hostname">
            <Input
              value={form.hostname ?? ""}
              disabled={!canManage}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, hostname: event.target.value }))
              }
            />
          </Field>
          <Field label="Description">
            <Input
              value={form.description ?? ""}
              disabled={!canManage}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  description: event.target.value,
                }))
              }
            />
          </Field>
          {canManage ? (
            <SheetFooter className="px-0">
              <Button type="submit">Save</Button>
            </SheetFooter>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
  )
}

export function NextAvailableIPDialog({
  subnet,
  isOpen,
  onClose,
}: {
  subnet: IPAMSubnet
  isOpen: boolean
  onClose: () => void
}) {
  const [limit, setLimit] = React.useState<number | string>(5)
  const [ips, setIps] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null)

  const fetchIPs = React.useCallback(async () => {
    if (!subnet?.id) return
    setLoading(true)
    setError(null)
    try {
      const parsedLimit = typeof limit === "number" ? limit : (parseInt(limit, 10) || 5)
      const res = await api.getNextAvailableIPs(subnet.id, parsedLimit)
      setIps(res.addresses || [])
    } catch (err: any) {
      setError(err?.message || "Failed to fetch available IPs")
    } finally {
      setLoading(false)
    }
  }, [subnet?.id, limit])

  React.useEffect(() => {
    if (isOpen) {
      fetchIPs()
    } else {
      setIps([])
      setLimit(5)
      setError(null)
      setCopiedIndex(null)
    }
  }, [isOpen, fetchIPs])

  const copyToClipboard = async (ip: string, index: number) => {
    try {
      await navigator.clipboard.writeText(ip)
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 2000)
    } catch (err) {
      // ignore
    }
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="sm:max-w-[425px]">
        <AlertDialogHeader>
          <AlertDialogTitle>Next Available IPs</AlertDialogTitle>
          <AlertDialogDescription>
            Get the next free IP addresses from {subnet.name} ({subnet.cidr})
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-4 py-4">
          <div className="flex items-center gap-4">
            <Label htmlFor="ip-limit" className="text-right">
              Count
            </Label>
            <Input
              id="ip-limit"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={limit}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9]/g, "")
                if (val === "") {
                  setLimit("")
                  return
                }
                const parsed = parseInt(val, 10)
                setLimit(Math.min(100, Math.max(1, parsed)))
              }}
              className="w-20"
            />
            <Button size="sm" onClick={fetchIPs} disabled={loading}>
              Refresh
            </Button>
          </div>

          <div className="min-h-[120px] rounded-md border border-muted bg-muted/40 p-4">
            {loading ? (
              <div className="flex h-[100px] items-center justify-center text-xs text-muted-foreground">
                Searching for available IPs...
              </div>
            ) : error ? (
              <div className="flex h-[100px] items-center justify-center text-xs text-destructive text-center">
                {error}
              </div>
            ) : ips.length === 0 ? (
              <div className="flex h-[100px] items-center justify-center text-xs text-muted-foreground text-center">
                No free IP addresses available in this subnet.
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto pr-1">
                {ips.map((ip, idx) => (
                  <div
                    key={ip}
                    onClick={() => copyToClipboard(ip, idx)}
                    className="flex items-center justify-between gap-2 rounded bg-background px-3 py-2 text-sm font-mono border border-border cursor-pointer hover:bg-accent/40 active:bg-accent transition-colors group"
                  >
                    <span>{ip}</span>
                    <span className="text-[10px] text-muted-foreground group-hover:text-foreground">
                      {copiedIndex === idx ? (
                        <span className="text-emerald-500 font-sans">Copied!</span>
                      ) : (
                        <span>Click to copy</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
