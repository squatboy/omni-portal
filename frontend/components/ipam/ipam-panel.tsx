"use client"

import * as React from "react"
import { Loader2, Plus } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"
import { toast } from "sonner"

import { api } from "@/lib/api"
import type {
  IPAMAddress,
  IPAMLocation,
  IPAMNetwork,
  IPAMSubnet,
  IPAMSummary,
} from "@/lib/types"
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
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { topIPv4SubnetRows, visibleIPAMActions } from "./utils"
import { EmptyLine } from "./shared"
import { SummaryCards, IPAMTree } from "./ipam-tree"
import {
  LocationTable,
  NetworkTable,
  SubnetTable,
} from "./resource-tables"
import {
  DeleteDialog,
  ResourceSheetPanel,
  resourceSheetKey,
} from "./resource-sheet"
import { SubnetAddressDetails, AddressSheetPanel } from "./address-panel"
import type {
  AddressIndex,
  DeleteTarget,
  ResourceFormState,
  ResourceKind,
  ResourceSheet,
} from "./types"

const chartConfig = {
  hosts: {
    label: "Hosts",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

export function IPAMPanel({ canManage }: { canManage: boolean }) {
  const actions = visibleIPAMActions(canManage)
  const [summary, setSummary] = React.useState<IPAMSummary | null>(null)
  const [locations, setLocations] = React.useState<IPAMLocation[]>([])
  const [networks, setNetworks] = React.useState<IPAMNetwork[]>([])
  const [subnets, setSubnets] = React.useState<IPAMSubnet[]>([])
  const [addressesBySubnet, setAddressesBySubnet] =
    React.useState<AddressIndex>({})
  const [activeTab, setActiveTab] = React.useState<ResourceKind>("location")
  const [selectedSubnetId, setSelectedSubnetId] = React.useState<string | null>(
    null
  )
  const [resourceSheet, setResourceSheet] =
    React.useState<ResourceSheet | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<DeleteTarget | null>(
    null
  )
  const [addressSheet, setAddressSheet] = React.useState<IPAMAddress | null>(
    null
  )
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const loadRequestRef = React.useRef(0)
  const [scanningSubnets, setScanningSubnets] = React.useState<
    Record<string, boolean>
  >({})

  const loadAll = React.useCallback(async () => {
    const requestId = ++loadRequestRef.current
    setRefreshing(true)
    try {
      const [nextSummary, nextLocations, nextNetworks, nextSubnets] =
        await Promise.all([
          api.ipamSummary(),
          api.listIPAMLocations(),
          api.listIPAMNetworks(),
          api.listIPAMSubnets(),
        ])
      const addressPairs = await Promise.all(
        nextSubnets.map(
          async (subnet) =>
            [subnet.id, await api.listIPAMAddresses(subnet.id)] as const
        )
      )
      if (requestId !== loadRequestRef.current) return
      const nextAddressIndex = Object.fromEntries(addressPairs)
      setSummary(nextSummary)
      setLocations(nextLocations)
      setNetworks(nextNetworks)
      setSubnets(nextSubnets)
      setAddressesBySubnet(nextAddressIndex)
      setSelectedSubnetId((current) =>
        current && nextSubnets.some((subnet) => subnet.id === current)
          ? current
          : (nextSubnets[0]?.id ?? null)
      )
      setError(null)
    } catch (loadError) {
      if (requestId !== loadRequestRef.current) return
      setError(
        loadError instanceof Error ? loadError.message : "IPAM load failed."
      )
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])

  React.useEffect(() => {
    const id = window.setTimeout(() => {
      void loadAll()
    }, 0)
    return () => window.clearTimeout(id)
  }, [loadAll])

  const selectedSubnet =
    subnets.find((subnet) => subnet.id === selectedSubnetId) ?? null
  const selectedAddresses = selectedSubnet
    ? (addressesBySubnet[selectedSubnet.id] ?? [])
    : []
  const chartRows = topIPv4SubnetRows(subnets, addressesBySubnet)

  async function saveResource(target: ResourceSheet, form: ResourceFormState) {
    if (target.kind === "location") {
      await api.saveIPAMLocation({
        id: target.item?.id ?? "",
        name: form.name.trim(),
        description: form.description.trim() || null,
      })
      toast.success("Location saved.")
    }
    if (target.kind === "network") {
      await api.saveIPAMNetwork({
        id: target.item?.id ?? "",
        locationId: form.locationId,
        name: form.name.trim(),
        description: form.description.trim() || null,
      })
      toast.success("Network saved.")
    }
    if (target.kind === "subnet") {
      const network = networks.find((item) => item.id === form.networkId)
      await api.saveIPAMSubnet({
        id: target.item?.id ?? "",
        networkId: form.networkId,
        locationId: network?.locationId,
        name: form.name.trim(),
        cidr: form.cidr.trim(),
        description: form.description.trim() || null,
        autoDiscovery: form.autoDiscovery,
        scanIntervalSeconds: form.scanIntervalSeconds,
      })
      toast.success("Subnet saved.")
    }
    setResourceSheet(null)
    await loadAll()
  }

  async function deleteResource(target: DeleteTarget) {
    if (target.kind === "location") await api.deleteIPAMLocation(target.item.id)
    if (target.kind === "network") await api.deleteIPAMNetwork(target.item.id)
    if (target.kind === "subnet") await api.deleteIPAMSubnet(target.item.id)
    toast.success(`${target.item.name} deleted.`)
    setDeleteTarget(null)
    await loadAll()
  }

  async function rescanSubnet(subnet: IPAMSubnet) {
    setScanningSubnets((prev) => ({ ...prev, [subnet.id]: true }))
    try {
      await api.rescanIPAMSubnet(subnet.id)
      toast.success(`Rescan completed for ${subnet.name}.`)
      await loadAll()
    } finally {
      setScanningSubnets((prev) => ({ ...prev, [subnet.id]: false }))
    }
  }

  async function saveAddress(address: IPAMAddress) {
    const next = await api.saveIPAMAddress(address)
    setAddressesBySubnet((prev) => ({
      ...prev,
      [next.subnetId]: (prev[next.subnetId] ?? []).map((item) =>
        item.id === next.id ? next : item
      ),
    }))
    setAddressSheet(null)
    toast.success("IP detail saved.")
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <div className="flex flex-col gap-4">
          <SummaryCards summary={summary} loading={loading} />
          <Card>
            <CardHeader>
              <CardTitle>Top IPv4 subnets by number of hosts</CardTitle>
              <CardDescription>
                Ranked from currently loaded subnet address rows.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {chartRows.length > 0 ? (
                <ChartContainer
                  config={chartConfig}
                  className="h-[220px] w-full"
                  initialDimension={{ width: 640, height: 220 }}
                >
                  <BarChart data={chartRows}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="cidr"
                      tickLine={false}
                      tickMargin={8}
                      axisLine={false}
                    />
                    <ChartTooltip
                      content={<ChartTooltipContent hideLabel />}
                      cursor={false}
                    />
                    <Bar
                      dataKey="hosts"
                      fill="var(--color-hosts)"
                      radius={4}
                    />
                  </BarChart>
                </ChartContainer>
              ) : (
                <EmptyLine label="No subnet host data." />
              )}
            </CardContent>
          </Card>
        </div>
        <IPAMTree
          locations={locations}
          networks={networks}
          subnets={subnets}
          addressesBySubnet={addressesBySubnet}
          selectedSubnetId={selectedSubnetId}
          onSelectSubnet={setSelectedSubnetId}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>IPAM Home</CardTitle>
          <CardDescription>
            Location, network, subnet, and address state in one view.
          </CardDescription>
          <CardAction>
            {refreshing ? (
              <Badge variant="secondary">
                <Loader2 data-icon="inline-start" className="animate-spin" />
                Loading
              </Badge>
            ) : null}
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error ? <Badge variant="destructive">{error}</Badge> : null}
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as ResourceKind)}
          >
            <div className="flex items-center justify-between gap-3">
              <TabsList>
                <TabsTrigger value="location">Location</TabsTrigger>
                <TabsTrigger value="network">Network</TabsTrigger>
                <TabsTrigger value="subnet">Subnet</TabsTrigger>
              </TabsList>
              {actions.create ? (
                <Button
                  size="sm"
                  onClick={() => setResourceSheet({ kind: activeTab })}
                >
                  <Plus data-icon="inline-start" />
                  Create
                </Button>
              ) : null}
            </div>
            <TabsContent value="location">
              <LocationTable
                locations={locations}
                networks={networks}
                subnets={subnets}
                canManage={actions.update}
                onEdit={(item) => setResourceSheet({ kind: "location", item })}
                onDelete={(item) =>
                  setDeleteTarget({ kind: "location", item })
                }
              />
            </TabsContent>
            <TabsContent value="network">
              <NetworkTable
                locations={locations}
                networks={networks}
                subnets={subnets}
                canManage={actions.update}
                onEdit={(item) => setResourceSheet({ kind: "network", item })}
                onDelete={(item) => setDeleteTarget({ kind: "network", item })}
              />
            </TabsContent>
            <TabsContent value="subnet">
              <SubnetTable
                networks={networks}
                subnets={subnets}
                addressesBySubnet={addressesBySubnet}
                selectedSubnetId={selectedSubnetId}
                canManage={actions.update}
                onSelect={setSelectedSubnetId}
                onEdit={(item) => setResourceSheet({ kind: "subnet", item })}
                onDelete={(item) => setDeleteTarget({ kind: "subnet", item })}
                scanningSubnets={scanningSubnets}
                onRescan={(item) =>
                  void rescanSubnet(item).catch((rescanError) =>
                    toast.error(
                      rescanError instanceof Error
                        ? rescanError.message
                        : "Rescan failed."
                    )
                  )
                }
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {selectedSubnet ? (
        <SubnetAddressDetails
          subnet={selectedSubnet}
          addresses={selectedAddresses}
          onOpenAddress={setAddressSheet}
        />
      ) : null}

      {resourceSheet ? (
        <ResourceSheetPanel
          key={resourceSheetKey(resourceSheet)}
          target={resourceSheet}
          locations={locations}
          networks={networks}
          onOpenChange={(open) => {
            if (!open) setResourceSheet(null)
          }}
          onSave={(target, form) =>
            void saveResource(target, form).catch((saveError) =>
              toast.error(
                saveError instanceof Error ? saveError.message : "Save failed."
              )
            )
          }
        />
      ) : null}
      <DeleteDialog
        target={deleteTarget}
        networks={networks}
        subnets={subnets}
        addressesBySubnet={addressesBySubnet}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        onDelete={(target) =>
          void deleteResource(target).catch((deleteError) =>
            toast.error(
              deleteError instanceof Error
                ? deleteError.message
                : "Delete failed."
            )
          )
        }
      />
      {addressSheet ? (
        <AddressSheetPanel
          key={addressSheet.id}
          address={addressSheet}
          canManage={actions.editAddress}
          onOpenChange={(open) => {
            if (!open) setAddressSheet(null)
          }}
          onSave={(address) =>
            void saveAddress(address).catch((saveError) =>
              toast.error(
                saveError instanceof Error ? saveError.message : "Save failed."
              )
            )
          }
        />
      ) : null}
    </div>
  )
}
