"use client"

import * as React from "react"
import { ChevronRight, MapPin, Network, Server } from "lucide-react"

import type { IPAMLocation, IPAMNetwork, IPAMSubnet, IPAMSummary } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
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
import { countIPAMAddresses } from "./utils"
import { EmptyLine, StatusBadge } from "./shared"
import type { AddressIndex } from "./types"

export function SummaryCards({
  summary,
  loading,
}: {
  summary: IPAMSummary | null
  loading: boolean
}) {
  const items = [
    { label: "Locations", value: summary?.locations },
    { label: "Networks", value: summary?.networks },
    { label: "Subnets", value: summary?.subnets },
    { label: "Addresses", value: summary?.addresses.total },
    { label: "Used", value: summary?.addresses.used },
    { label: "Offline", value: summary?.addresses.offline },
    { label: "Free", value: summary?.addresses.free },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <Card key={item.label} size="sm">
          <CardHeader>
            <CardDescription>{item.label}</CardDescription>
            <CardTitle className="font-mono text-lg">
              {loading ? "--" : (item.value ?? 0)}
            </CardTitle>
          </CardHeader>
        </Card>
      ))}
    </div>
  )
}

export function IPAMTree({
  locations,
  networks,
  subnets,
  addressesBySubnet,
  selectedSubnetId,
  onSelectSubnet,
}: {
  locations: IPAMLocation[]
  networks: IPAMNetwork[]
  subnets: IPAMSubnet[]
  addressesBySubnet: AddressIndex
  selectedSubnetId: string | null
  onSelectSubnet: (id: string) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Location tree</CardTitle>
        <CardDescription>
          Location {"->"} Network {"->"} Subnet {"->"} IP status.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex max-h-[520px] flex-col gap-2 overflow-auto">
        {locations.length === 0 ? <EmptyLine label="No locations." /> : null}
        {locations.map((location) => {
          const childNetworks = networks.filter(
            (network) => network.locationId === location.id
          )
          return (
            <Collapsible key={location.id} defaultOpen>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-start">
                  <ChevronRight data-icon="inline-start" />
                  <MapPin data-icon="inline-start" />
                  <span className="truncate">{location.name}</span>
                  <Badge variant="secondary" className="ml-auto">
                    {childNetworks.length}
                  </Badge>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="ml-4 flex flex-col gap-1">
                {childNetworks.map((network) => {
                  const childSubnets = subnets.filter(
                    (subnet) => subnet.networkId === network.id
                  )
                  return (
                    <Collapsible key={network.id} defaultOpen>
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          className="w-full justify-start"
                        >
                          <ChevronRight data-icon="inline-start" />
                          <Network data-icon="inline-start" />
                          <span className="truncate">{network.name}</span>
                          <Badge variant="secondary" className="ml-auto">
                            {childSubnets.length}
                          </Badge>
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="ml-4 flex flex-col gap-1">
                        {childSubnets.map((subnet) => {
                          const counts = countIPAMAddresses(
                            addressesBySubnet[subnet.id] ?? []
                          )
                          return (
                            <Button
                              key={subnet.id}
                              variant={
                                selectedSubnetId === subnet.id
                                  ? "secondary"
                                  : "ghost"
                              }
                              className="h-auto w-full justify-start py-2"
                              onClick={() => onSelectSubnet(subnet.id)}
                            >
                              <Server data-icon="inline-start" />
                              <span className="min-w-0 flex-1 truncate text-left">
                                {subnet.name}
                              </span>
                              <span className="flex items-center gap-1">
                                <StatusBadge
                                  status="used"
                                  count={counts.used}
                                />
                                <StatusBadge
                                  status="offline"
                                  count={counts.offline}
                                />
                                <StatusBadge
                                  status="free"
                                  count={counts.free}
                                />
                              </span>
                            </Button>
                          )
                        })}
                      </CollapsibleContent>
                    </Collapsible>
                  )
                })}
              </CollapsibleContent>
            </Collapsible>
          )
        })}
      </CardContent>
    </Card>
  )
}
