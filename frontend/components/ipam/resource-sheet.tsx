"use client"

import * as React from "react"

import type { IPAMLocation, IPAMNetwork, IPAMSubnet } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Field } from "./shared"
import type { AddressIndex, DeleteTarget, ResourceFormState, ResourceSheet } from "./types"

const scanIntervals = [
  { label: "30m", value: 1800 },
  { label: "1h", value: 3600 },
  { label: "4h", value: 14400 },
  { label: "12h", value: 43200 },
  { label: "24h", value: 86400 },
]

export function resourceSheetKey(target: ResourceSheet) {
  return `${target.kind}:${target.item?.id ?? "new"}`
}

function createResourceForm(
  target: ResourceSheet,
  locations: IPAMLocation[],
  networks: IPAMNetwork[]
): ResourceFormState {
  return {
    locationId:
      target.kind === "network"
        ? (target.item?.locationId ?? locations[0]?.id ?? "")
        : (locations[0]?.id ?? ""),
    networkId:
      target.kind === "subnet"
        ? (target.item?.networkId ?? networks[0]?.id ?? "")
        : (networks[0]?.id ?? ""),
    name: target.item?.name ?? "",
    cidr: target.kind === "subnet" ? (target.item?.cidr ?? "") : "",
    description: target.item?.description ?? "",
    autoDiscovery:
      target.kind === "subnet" ? (target.item?.autoDiscovery ?? true) : true,
    scanIntervalSeconds:
      target.kind === "subnet"
        ? (target.item?.scanIntervalSeconds ?? 3600)
        : 3600,
  }
}

function childCounts(
  target: DeleteTarget,
  networks: IPAMNetwork[],
  subnets: IPAMSubnet[],
  addressesBySubnet: AddressIndex
) {
  if (target.kind === "location") {
    const networkIds = networks
      .filter((network) => network.locationId === target.item.id)
      .map((network) => network.id)
    const childSubnets = subnets.filter((subnet) =>
      networkIds.includes(subnet.networkId)
    )
    return {
      networks: networkIds.length,
      subnets: childSubnets.length,
      addresses: childSubnets.reduce(
        (sum, subnet) => sum + (addressesBySubnet[subnet.id]?.length ?? 0),
        0
      ),
    }
  }
  if (target.kind === "network") {
    const childSubnets = subnets.filter(
      (subnet) => subnet.networkId === target.item.id
    )
    return {
      networks: 0,
      subnets: childSubnets.length,
      addresses: childSubnets.reduce(
        (sum, subnet) => sum + (addressesBySubnet[subnet.id]?.length ?? 0),
        0
      ),
    }
  }
  return {
    networks: 0,
    subnets: 0,
    addresses: addressesBySubnet[target.item.id]?.length ?? 0,
  }
}

export function ResourceSheetPanel({
  target,
  locations,
  networks,
  onOpenChange,
  onSave,
}: {
  target: ResourceSheet
  locations: IPAMLocation[]
  networks: IPAMNetwork[]
  onOpenChange: (open: boolean) => void
  onSave: (target: ResourceSheet, form: ResourceFormState) => void
}) {
  const [form, setForm] = React.useState<ResourceFormState>(() =>
    createResourceForm(target, locations, networks)
  )

  const title = `${target.item ? "Update" : "Create"} ${target.kind}`
  const isNetworkEdit = target.kind === "network" && Boolean(target.item)
  const isSubnetEdit = target.kind === "subnet" && Boolean(target.item)

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {target.kind === "subnet"
              ? "CIDR is immutable after creation."
              : "Name and description are editable."}
          </SheetDescription>
        </SheetHeader>
        <form
          className="flex flex-col gap-4 px-6"
          onSubmit={(event) => {
            event.preventDefault()
            onSave(target, form)
          }}
        >
          {target.kind === "network" ? (
            <Field label="Location">
              <Select
                value={form.locationId}
                onValueChange={(locationId) =>
                  setForm((prev) => ({ ...prev, locationId }))
                }
                disabled={isNetworkEdit}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          {target.kind === "subnet" ? (
            <Field label="Network">
              <Select
                value={form.networkId}
                onValueChange={(networkId) =>
                  setForm((prev) => ({ ...prev, networkId }))
                }
                disabled={isSubnetEdit}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select network" />
                </SelectTrigger>
                <SelectContent>
                  {networks.map((network) => (
                    <SelectItem key={network.id} value={network.id}>
                      {network.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
              required
            />
          </Field>
          {target.kind === "subnet" ? (
            <Field label="CIDR">
              <Input
                value={form.cidr}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, cidr: event.target.value }))
                }
                placeholder="10.40.0.0/24"
                disabled={isSubnetEdit}
                required
              />
            </Field>
          ) : null}
          <Field label="Description">
            <Input
              value={form.description}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  description: event.target.value,
                }))
              }
            />
          </Field>
          {target.kind === "subnet" ? (
            <>
              <label className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={form.autoDiscovery}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({
                      ...prev,
                      autoDiscovery: checked === true,
                    }))
                  }
                />
                Auto discovery
              </label>
              <Field label="Scan interval">
                <Select
                  value={String(form.scanIntervalSeconds)}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      scanIntervalSeconds: Number(value),
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {scanIntervals.map((interval) => (
                      <SelectItem
                        key={interval.value}
                        value={String(interval.value)}
                      >
                        {interval.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </>
          ) : null}
          <SheetFooter className="px-0">
            <Button type="submit">Save</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

export function DeleteDialog({
  target,
  networks,
  subnets,
  addressesBySubnet,
  onOpenChange,
  onDelete,
}: {
  target: DeleteTarget | null
  networks: IPAMNetwork[]
  subnets: IPAMSubnet[]
  addressesBySubnet: AddressIndex
  onOpenChange: (open: boolean) => void
  onDelete: (target: DeleteTarget) => void
}) {
  const counts = target
    ? childCounts(target, networks, subnets, addressesBySubnet)
    : { networks: 0, subnets: 0, addresses: 0 }

  return (
    <AlertDialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {target?.item.name}</AlertDialogTitle>
          <AlertDialogDescription>
            This cascades to {counts.networks} networks, {counts.subnets}{" "}
            subnets, and {counts.addresses} IP addresses.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              if (target) onDelete(target)
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
