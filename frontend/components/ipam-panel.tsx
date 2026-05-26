"use client"

import * as React from "react"
import {
  ChevronRight,
  Edit,
  Loader2,
  MapPin,
  Network,
  Plus,
  Radar,
  Server,
  Trash2,
} from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"
import { toast } from "sonner"

import { api } from "@/lib/api"
import type {
  IPAMAddress,
  IPAMAddressStatus,
  IPAMLocation,
  IPAMNetwork,
  IPAMSubnet,
  IPAMSummary,
} from "@/lib/types"
import { cn } from "@/lib/utils"
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
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

type ResourceKind = "location" | "network" | "subnet"
type AddressIndex = Record<string, IPAMAddress[]>

type ResourceSheet =
  | { kind: "location"; item?: IPAMLocation }
  | { kind: "network"; item?: IPAMNetwork }
  | { kind: "subnet"; item?: IPAMSubnet }

type DeleteTarget =
  | { kind: "location"; item: IPAMLocation }
  | { kind: "network"; item: IPAMNetwork }
  | { kind: "subnet"; item: IPAMSubnet }

const scanIntervals = [
  { label: "30m", value: 1800 },
  { label: "1h", value: 3600 },
  { label: "4h", value: 14400 },
  { label: "12h", value: 43200 },
  { label: "24h", value: 86400 },
]

const chartConfig = {
  hosts: {
    label: "Hosts",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

export function visibleIPAMActions(canManage: boolean) {
  return {
    create: canManage,
    update: canManage,
    delete: canManage,
    rescan: canManage,
    editAddress: canManage,
  }
}

export function countIPAMAddresses(addresses: IPAMAddress[]) {
  return addresses.reduce(
    (acc, address) => {
      acc.total += 1
      acc[address.status] += 1
      return acc
    },
    { total: 0, used: 0, offline: 0, free: 0 }
  )
}

export function topIPv4SubnetRows(
  subnets: IPAMSubnet[],
  addressesBySubnet: AddressIndex,
  limit = 5
) {
  return subnets
    .map((subnet) => ({
      id: subnet.id,
      name: subnet.name,
      cidr: subnet.cidr,
      hosts: addressesBySubnet[subnet.id]?.length ?? 0,
    }))
    .sort((a, b) => b.hosts - a.hosts)
    .slice(0, limit)
}

function stripCIDRSuffix(address: string) {
  return address.split("/")[0]
}

function ipv4SortKey(address: string) {
  const parts = stripCIDRSuffix(address).split(".").map(Number)
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return null
  }
  return parts.reduce((acc, part) => acc * 256 + part, 0)
}

export function ipamAddressButtonLabel(address: string) {
  const hostAddress = stripCIDRSuffix(address)
  const lastOctet = hostAddress.split(".").at(-1)
  return lastOctet ? `.${lastOctet}` : hostAddress
}

export function sortIPAMAddressesByIPv4(addresses: IPAMAddress[]) {
  return [...addresses].sort((a, b) => {
    const left = ipv4SortKey(a.address)
    const right = ipv4SortKey(b.address)
    if (left !== null && right !== null) {
      return left - right
    }
    if (left !== null) {
      return -1
    }
    if (right !== null) {
      return 1
    }
    return a.address.localeCompare(b.address)
  })
}

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
  const [scanningSubnets, setScanningSubnets] = React.useState<Record<string, boolean>>({})

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
      if (requestId !== loadRequestRef.current) {
        return
      }
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
      if (requestId !== loadRequestRef.current) {
        return
      }
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
    if (target.kind === "location") {
      await api.deleteIPAMLocation(target.item.id)
    }
    if (target.kind === "network") {
      await api.deleteIPAMNetwork(target.item.id)
    }
    if (target.kind === "subnet") {
      await api.deleteIPAMSubnet(target.item.id)
    }
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
                    <Bar dataKey="hosts" fill="var(--color-hosts)" radius={4} />
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
                onDelete={(item) => setDeleteTarget({ kind: "location", item })}
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
            if (!open) {
              setResourceSheet(null)
            }
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
          if (!open) {
            setDeleteTarget(null)
          }
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
            if (!open) {
              setAddressSheet(null)
            }
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

function SummaryCards({
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

function IPAMTree({
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

function LocationTable({
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

function NetworkTable({
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

function SubnetTable({
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
                <Badge variant={subnet.autoDiscovery ? "secondary" : "outline"}>
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

function RowActions({
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

function SubnetAddressDetails({
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

type ResourceFormState = {
  locationId: string
  networkId: string
  name: string
  cidr: string
  description: string
  autoDiscovery: boolean
  scanIntervalSeconds: number
}

function resourceSheetKey(target: ResourceSheet) {
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

function ResourceSheetPanel({
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

  const title = target
    ? `${target.item ? "Update" : "Create"} ${target.kind}`
    : "IPAM resource"
  const isNetworkEdit = target.kind === "network" && Boolean(target.item)
  const isSubnetEdit = target.kind === "subnet" && Boolean(target.item)

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {target?.kind === "subnet"
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

function DeleteDialog({
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
              if (target) {
                onDelete(target)
              }
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function AddressSheetPanel({
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

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  const id = React.useId()
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {React.isValidElement<{ id?: string }>(children)
        ? React.cloneElement(children, { id })
        : children}
    </div>
  )
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  )
}

function StatusBadge({
  status,
  count,
}: {
  status: IPAMAddressStatus
  count: number | null
}) {
  return (
    <Badge
      variant={
        status === "offline"
          ? "destructive"
          : status === "used"
            ? "secondary"
            : "outline"
      }
      className={cn(
        status === "used" &&
          "border-[color:color-mix(in_oklch,var(--status-ok)_45%,transparent)] bg-[color:color-mix(in_oklch,var(--status-ok)_14%,transparent)] text-[color:var(--status-ok)]"
      )}
    >
      {status}
      {count === null ? null : ` ${count}`}
    </Badge>
  )
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

function formatNullableTime(value?: string | null) {
  if (!value) {
    return "-"
  }
  return new Date(value).toLocaleString()
}

function EmptyLine({ label }: { label: string }) {
  return <div className="py-3 text-center text-muted-foreground">{label}</div>
}
