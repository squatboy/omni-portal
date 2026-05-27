"use client"

import * as React from "react"

import type { IPAMAddress, IPAMAddressStatus, IPAMSubnet } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{subnet.name} IP detail</CardTitle>
        <CardDescription>{subnet.cidr}</CardDescription>
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
            {(["used", "offline", "free"] as IPAMAddressStatus[]).map(
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
          <ReadOnlyRow label="Status" value={form.status} />
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
