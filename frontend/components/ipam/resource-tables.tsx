"use client"

import * as React from "react"
import { Edit, Loader2, Radar, Trash2 } from "lucide-react"

import type { IPAMLocation, IPAMNetwork, IPAMSubnet } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { countIPAMAddresses } from "./utils"
import { EmptyLine, StatusBadge } from "./shared"
import type { AddressIndex } from "./types"

export function RowActions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center gap-1">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Edit"
              onClick={onEdit}
            >
              <Edit data-icon="inline-start" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Edit</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="destructive"
              size="icon-sm"
              aria-label="Delete"
              onClick={onDelete}
            >
              <Trash2 data-icon="inline-start" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Delete</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}

export function LocationTable({
  locations,
  networks,
  subnets,
  canManage,
  onEdit,
  onDelete,
}: {
  locations: IPAMLocation[]
  networks: IPAMNetwork[]
  subnets: IPAMSubnet[]
  canManage: boolean
  onEdit: (item: IPAMLocation) => void
  onDelete: (item: IPAMLocation) => void
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Networks</TableHead>
          <TableHead>Subnets</TableHead>
          {canManage ? <TableHead className="w-24">Actions</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {locations.map((location) => {
          const networkIds = networks
            .filter((network) => network.locationId === location.id)
            .map((network) => network.id)
          return (
            <TableRow key={location.id}>
              <TableCell className="font-medium">{location.name}</TableCell>
              <TableCell>{location.description ?? "-"}</TableCell>
              <TableCell>{networkIds.length}</TableCell>
              <TableCell>
                {
                  subnets.filter((subnet) =>
                    networkIds.includes(subnet.networkId)
                  ).length
                }
              </TableCell>
              {canManage ? (
                <TableCell>
                  <RowActions
                    onEdit={() => onEdit(location)}
                    onDelete={() => onDelete(location)}
                  />
                </TableCell>
              ) : null}
            </TableRow>
          )
        })}
        {locations.length === 0 ? (
          <TableRow>
            <TableCell colSpan={canManage ? 5 : 4}>
              <EmptyLine label="No locations." />
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  )
}

export function NetworkTable({
  locations,
  networks,
  subnets,
  canManage,
  onEdit,
  onDelete,
}: {
  locations: IPAMLocation[]
  networks: IPAMNetwork[]
  subnets: IPAMSubnet[]
  canManage: boolean
  onEdit: (item: IPAMNetwork) => void
  onDelete: (item: IPAMNetwork) => void
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Location</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Subnets</TableHead>
          {canManage ? <TableHead className="w-24">Actions</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {networks.map((network) => (
          <TableRow key={network.id}>
            <TableCell className="font-medium">{network.name}</TableCell>
            <TableCell>
              {locations.find((location) => location.id === network.locationId)
                ?.name ?? "-"}
            </TableCell>
            <TableCell>{network.description ?? "-"}</TableCell>
            <TableCell>
              {
                subnets.filter((subnet) => subnet.networkId === network.id)
                  .length
              }
            </TableCell>
            {canManage ? (
              <TableCell>
                <RowActions
                  onEdit={() => onEdit(network)}
                  onDelete={() => onDelete(network)}
                />
              </TableCell>
            ) : null}
          </TableRow>
        ))}
        {networks.length === 0 ? (
          <TableRow>
            <TableCell colSpan={canManage ? 5 : 4}>
              <EmptyLine label="No networks." />
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  )
}

export function SubnetTable({
  networks,
  subnets,
  addressesBySubnet,
  selectedSubnetId,
  canManage,
  onSelect,
  onEdit,
  onDelete,
  scanningSubnets = {},
  onRescan,
}: {
  networks: IPAMNetwork[]
  subnets: IPAMSubnet[]
  addressesBySubnet: AddressIndex
  selectedSubnetId: string | null
  canManage: boolean
  onSelect: (id: string) => void
  onEdit: (item: IPAMSubnet) => void
  onDelete: (item: IPAMSubnet) => void
  scanningSubnets?: Record<string, boolean>
  onRescan: (item: IPAMSubnet) => void
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>CIDR</TableHead>
          <TableHead>Network</TableHead>
          <TableHead>Hosts</TableHead>
          <TableHead>Scan</TableHead>
          {canManage ? <TableHead className="w-36">Actions</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {subnets.map((subnet) => {
          const counts = countIPAMAddresses(addressesBySubnet[subnet.id] ?? [])
          return (
            <TableRow
              key={subnet.id}
              data-state={
                selectedSubnetId === subnet.id ? "selected" : undefined
              }
            >
              <TableCell>
                <Button
                  variant="link"
                  className="h-auto p-0"
                  onClick={() => onSelect(subnet.id)}
                >
                  {subnet.name}
                </Button>
              </TableCell>
              <TableCell className="font-mono">{subnet.cidr}</TableCell>
              <TableCell>
                {networks.find((network) => network.id === subnet.networkId)
                  ?.name ?? "-"}
              </TableCell>
              <TableCell>
                <span className="flex items-center gap-1">
                  <StatusBadge status="used" count={counts.used} />
                  <StatusBadge status="offline" count={counts.offline} />
                  <StatusBadge status="free" count={counts.free} />
                </span>
              </TableCell>
              <TableCell>
                <Badge
                  variant={subnet.autoDiscovery ? "secondary" : "outline"}
                >
                  {subnet.autoDiscovery ? "Auto" : "Manual"}
                </Badge>
              </TableCell>
              {canManage ? (
                <TableCell>
                  <div className="flex items-center gap-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon-sm"
                            aria-label={`Rescan ${subnet.name}`}
                            onClick={() => onRescan(subnet)}
                            disabled={scanningSubnets[subnet.id]}
                          >
                            {scanningSubnets[subnet.id] ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <Radar data-icon="inline-start" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Scan</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <RowActions
                      onEdit={() => onEdit(subnet)}
                      onDelete={() => onDelete(subnet)}
                    />
                  </div>
                </TableCell>
              ) : null}
            </TableRow>
          )
        })}
        {subnets.length === 0 ? (
          <TableRow>
            <TableCell colSpan={canManage ? 6 : 5}>
              <EmptyLine label="No subnets." />
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  )
}
