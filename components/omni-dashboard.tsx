"use client"

import * as React from "react"
import {
  Activity,
  AlertTriangle,
  Boxes,
  ExternalLink,
  GitBranch,
  HeartPulse,
  LayoutDashboard,
  Package,
  RefreshCw,
  Server,
  Workflow,
} from "lucide-react"

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
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type {
  ArgoCdData,
  CollectEnvelope,
  CollectSource,
  GitLabData,
  KubernetesData,
  NexusData,
  OverviewData,
  SourceStatus,
  VmsData,
} from "@/lib/collect/types"
import { cn } from "@/lib/utils"

const POLL_INTERVAL_MS = 15_000
type DashboardTab =
  | "overview"
  | "kubernetes"
  | "pods"
  | "vms"
  | "argocd"
  | "gitlab"
  | "nexus"
  | "health"

type DashboardSnapshot = {
  overview: CollectEnvelope<OverviewData, "overview">
  vms: CollectEnvelope<VmsData, "vms">
  kubernetes: CollectEnvelope<KubernetesData, "kubernetes">
  argocd: CollectEnvelope<ArgoCdData, "argocd">
  gitlab: CollectEnvelope<GitLabData, "gitlab">
  nexus: CollectEnvelope<NexusData, "nexus">
}

type SourceKey = Exclude<CollectSource, "overview">

const sourceLabels: Record<CollectSource, string> = {
  overview: "Overview",
  vms: "VM Inventory",
  kubernetes: "Kubernetes",
  argocd: "Argo CD",
  gitlab: "GitLab",
  nexus: "Nexus",
}

const statusLabels: Record<SourceStatus, string> = {
  ok: "OK",
  down: "DOWN",
  timeout: "TIMEOUT",
  permission_error: "PERMISSION",
  stale: "STALE",
  unknown: "UNKNOWN",
}

const sourceIcons: Record<
  SourceKey,
  React.ComponentType<{ className?: string }>
> = {
  vms: Server,
  kubernetes: Boxes,
  argocd: Workflow,
  gitlab: GitBranch,
  nexus: Package,
}

const sourceOrder: SourceKey[] = [
  "kubernetes",
  "vms",
  "argocd",
  "gitlab",
  "nexus",
]

export function OmniDashboard() {
  const [snapshot, setSnapshot] = React.useState<DashboardSnapshot | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState<DashboardTab>("overview")
  const [pollKey, setPollKey] = React.useState(0)
  const [lastUiRefreshAt, setLastUiRefreshAt] = React.useState<string | null>(
    null
  )

  const refresh = React.useCallback(async (force = false) => {
    setIsRefreshing(true)
    try {
      const nextSnapshot = await loadSnapshot(force)
      setSnapshot(nextSnapshot)
      setError(null)
      setLastUiRefreshAt(new Date().toISOString())
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Collect API polling failed."
      )
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  React.useEffect(() => {
    const initialId = window.setTimeout(() => {
      void refresh(false)
    }, 0)

    const intervalId = window.setInterval(() => {
      void refresh(false)
    }, POLL_INTERVAL_MS)

    return () => {
      window.clearTimeout(initialId)
      window.clearInterval(intervalId)
    }
  }, [refresh, pollKey])

  const sources = snapshot?.overview.data.sources ?? []

  return (
    <main className="min-h-svh bg-background text-foreground">
      <aside className="border-b bg-card/80 backdrop-blur lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:border-r lg:border-b-0">
        <div className="flex h-full flex-col gap-4 p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Activity className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">Omni</div>
              <div className="truncate text-xs text-muted-foreground">
                Infra control surface
              </div>
            </div>
          </div>

          <Separator />

          <nav className="flex flex-col gap-1">
            <SidebarItem
              icon={LayoutDashboard}
              label="Overview"
              active={activeTab === "overview"}
              onClick={() => setActiveTab("overview")}
            />
            <SidebarItem
              icon={HeartPulse}
              label="Platform Health"
              active={activeTab === "health"}
              onClick={() => setActiveTab("health")}
            />
            {sourceOrder.map((source) => {
              const summary = sources.find((item) => item.source === source)
              const Icon = sourceIcons[source]

              return (
                <SidebarItem
                  key={source}
                  icon={Icon}
                  label={sourceLabels[source]}
                  active={activeTab === source}
                  status={summary?.status ?? "unknown"}
                  stale={summary?.stale ?? false}
                  onClick={() => setActiveTab(source)}
                />
              )
            })}
          </nav>

          <div className="mt-auto flex flex-col gap-2 rounded-md border bg-background/60 p-3 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">UI refresh</span>
              <span className="font-mono">
                {lastUiRefreshAt ? formatTime(lastUiRefreshAt) : "--:--:--"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Interval</span>
              <span className="font-mono">30s</span>
            </div>
          </div>
        </div>
      </aside>

      <section className="min-w-0 lg:pl-64">
        <header className="sticky top-0 border-b bg-background/95 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold">
                Infrastructure Overview
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                Last collect{" "}
                {snapshot
                  ? formatDateTime(snapshot.overview.data.generatedAt)
                  : "loading"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {error ? (
                <Badge variant="destructive">
                  <AlertTriangle data-icon="inline-start" />
                  Poll failed
                </Badge>
              ) : null}
              <HealthBadge health={snapshot?.overview.data.health} />
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Refresh collect snapshot"
                disabled={isRefreshing}
                onClick={() => {
                  void refresh(true)
                  setPollKey((prev) => prev + 1)
                }}
              >
                <RefreshCw
                  data-icon="inline-start"
                  className={cn(isRefreshing && "animate-spin")}
                />
              </Button>
            </div>
          </div>
        </header>

        <div className="flex flex-col gap-4 p-4 md:p-6">
          {snapshot ? (
            <DashboardContent
              snapshot={snapshot}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          ) : (
            <DashboardSkeleton />
          )}
        </div>
      </section>
    </main>
  )
}

function DashboardContent({
  snapshot,
  activeTab,
  onTabChange,
}: {
  snapshot: DashboardSnapshot
  activeTab: DashboardTab
  onTabChange: (tab: DashboardTab) => void
}) {
  const kubernetes = snapshot.kubernetes.data
  const vms = snapshot.vms.data
  const argocd = snapshot.argocd.data
  const gitlab = snapshot.gitlab.data
  const nexus = snapshot.nexus.data

  const readyNodes = kubernetes.nodes.filter((node) => node.ready).length
  const upVms = vms.items.filter((vm) => vm.state === "up").length
  const syncedApps = argocd.applications.filter(
    (app) => app.syncStatus === "Synced"
  ).length
  const healthyApps = argocd.applications.filter(
    (app) => app.healthStatus === "Healthy"
  ).length
  const successfulPipelines = gitlab.projects.filter(
    (project) => project.latestPipeline?.status === "success"
  ).length

  return (
    <>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Kubernetes"
          value={`${readyNodes}/${kubernetes.nodes.length}`}
          detail={`${kubernetes.pods.ready}/${kubernetes.pods.total} pods ready`}
          status={snapshot.kubernetes.status}
          stale={snapshot.kubernetes.stale}
        />
        <MetricCard
          title="VM Reachability"
          value={`${upVms}/${vms.items.length}`}
          detail="ICMP target status"
          status={snapshot.vms.status}
          stale={snapshot.vms.stale}
        />
        <MetricCard
          title="Argo CD"
          value={`${syncedApps}/${argocd.applications.length}`}
          detail={`${healthyApps} healthy applications`}
          status={snapshot.argocd.status}
          stale={snapshot.argocd.stale}
        />
        <MetricCard
          title="CI / External"
          value={`${successfulPipelines}/${gitlab.projects.length}`}
          detail={nexus.reachable ? "Nexus reachable" : "Nexus unreachable"}
          status={
            snapshot.gitlab.status === "ok" && snapshot.nexus.status === "ok"
              ? "ok"
              : "stale"
          }
          stale={snapshot.gitlab.stale || snapshot.nexus.stale}
        />
      </section>

      <Tabs
        value={activeTab}
        onValueChange={(value) => onTabChange(value as DashboardTab)}
        className="min-w-0"
      >
        <TabsList className="w-full justify-start overflow-x-auto overflow-y-hidden">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="kubernetes">Kubernetes</TabsTrigger>
          <TabsTrigger value="pods">Pods</TabsTrigger>
          <TabsTrigger value="vms">VM Inventory</TabsTrigger>
          <TabsTrigger value="argocd">Argo CD</TabsTrigger>
          <TabsTrigger value="gitlab">GitLab</TabsTrigger>
          <TabsTrigger value="nexus">Nexus</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-2">
          <OverviewPanel snapshot={snapshot} />
        </TabsContent>
        <TabsContent value="health" className="mt-2">
          <PlatformHealthPanel snapshot={snapshot} />
        </TabsContent>
        <TabsContent value="kubernetes" className="mt-2">
          <KubernetesPanel envelope={snapshot.kubernetes} />
        </TabsContent>
        <TabsContent value="pods" className="mt-2">
          <PodsPanel envelope={snapshot.kubernetes} />
        </TabsContent>
        <TabsContent value="vms" className="mt-2">
          <VmPanel envelope={snapshot.vms} />
        </TabsContent>
        <TabsContent value="argocd" className="mt-2">
          <ArgoPanel envelope={snapshot.argocd} />
        </TabsContent>
        <TabsContent value="gitlab" className="mt-2">
          <GitLabPanel envelope={snapshot.gitlab} />
        </TabsContent>
        <TabsContent value="nexus" className="mt-2">
          <NexusPanel envelope={snapshot.nexus} />
        </TabsContent>
      </Tabs>
    </>
  )
}

function OverviewPanel({ snapshot }: { snapshot: DashboardSnapshot }) {
  const workloads = snapshot.kubernetes.data.workloads
  const projects = snapshot.gitlab.data.projects

  return (
    <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
      <Card size="sm" className="rounded-md">
        <CardHeader>
          <CardTitle>Workload Readiness</CardTitle>
          <CardDescription>
            {snapshot.kubernetes.data.clusterName} cluster snapshot
          </CardDescription>
          <CardAction>
            <StatusBadge
              status={snapshot.kubernetes.status}
              stale={snapshot.kubernetes.stale}
            />
          </CardAction>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Namespace</TableHead>
                <TableHead>Workload</TableHead>
                <TableHead>Ready</TableHead>
                <TableHead>Restarts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workloads.map((workload) => (
                <TableRow key={`${workload.namespace}-${workload.name}`}>
                  <TableCell className="font-mono text-xs">
                    {workload.namespace}
                  </TableCell>
                  <TableCell>
                    <div className="flex min-w-48 flex-col gap-1">
                      <span className="truncate font-medium">
                        {workload.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {workload.kind}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      status={
                        workload.readyReplicas === workload.desiredReplicas
                          ? "ok"
                          : "stale"
                      }
                      label={`${workload.readyReplicas}/${workload.desiredReplicas}`}
                    />
                  </TableCell>
                  <TableCell className="font-mono">
                    {workload.restartCount}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        <SourceHealthCard snapshot={snapshot} />
        <Card size="sm" className="rounded-md">
          <CardHeader>
            <CardTitle>CI/CD Feed</CardTitle>
            <CardDescription>Latest app repo signals</CardDescription>
            <CardAction>
              <StatusBadge
                status={snapshot.gitlab.status}
                stale={snapshot.gitlab.stale}
              />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {projects.map((project) => (
              <div
                key={project.path}
                className="flex items-center justify-between gap-3 rounded-md border bg-background/60 p-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {project.name}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {project.latestCommit?.title ?? "No commit snapshot"}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge
                    status={
                      project.latestPipeline?.status === "success"
                        ? "ok"
                        : project.latestPipeline
                          ? "stale"
                          : "unknown"
                    }
                    label={project.latestPipeline?.status ?? "missing"}
                  />
                  <ExternalLinkButton
                    href={project.link || "#"}
                    label={project.name}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function KubernetesPanel({
  envelope,
}: {
  envelope: CollectEnvelope<KubernetesData, "kubernetes">
}) {
  const data = envelope.data

  return (
    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <Card size="sm" className="rounded-md">
        <CardHeader>
          <CardTitle>Node Resources</CardTitle>
          <CardDescription>{data.clusterName} cluster</CardDescription>
          <CardAction>
            <StatusBadge status={envelope.status} stale={envelope.stale} />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {data.nodes.map((node) => (
            <div key={node.name} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {node.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {node.ready ? "Ready" : "NotReady"}
                  </div>
                </div>
                <StatusBadge status={node.ready ? "ok" : "down"} />
              </div>
              <ResourceBar
                label="CPU"
                value={node.cpuUsagePercent}
                fallback="n/a"
              />
              <ResourceBar
                label="Memory"
                value={node.memoryUsagePercent}
                fallback="n/a"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card size="sm" className="rounded-md">
        <CardHeader>
          <CardTitle>Workloads</CardTitle>
          <CardDescription>
            Pods {data.pods.ready}/{data.pods.total} ready, PVC{" "}
            {data.pvcs.bound}/{data.pvcs.total} bound
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Namespace</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Ready</TableHead>
                <TableHead>Restarts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.workloads.map((workload) => (
                <TableRow key={`${workload.namespace}-${workload.name}`}>
                  <TableCell className="font-mono text-xs">
                    {workload.namespace}
                  </TableCell>
                  <TableCell>
                    <div className="flex min-w-48 flex-col gap-1">
                      <span className="truncate font-medium">
                        {workload.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {workload.kind}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {workload.readyReplicas}/{workload.desiredReplicas}
                  </TableCell>
                  <TableCell className="font-mono">
                    {workload.restartCount}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function PodsPanel({
  envelope,
}: {
  envelope: CollectEnvelope<KubernetesData, "kubernetes">
}) {
  const data = envelope.data
  const workloads = data.appWorkloads

  return (
    <Card size="sm" className="rounded-md">
      <CardHeader>
        <CardTitle>Frontend / Backend Pods</CardTitle>
        <CardDescription>
          {workloads.length} app workloads in {data.namespaces.length} namespaces
        </CardDescription>
        <CardAction>
          <StatusBadge status={envelope.status} stale={envelope.stale} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Namespace</TableHead>
              <TableHead>App Workload</TableHead>
              <TableHead>Readiness</TableHead>
              <TableHead>Restart Count</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workloads.map((workload) => (
              <TableRow key={`${workload.namespace}-${workload.name}`}>
                <TableCell className="font-mono text-xs">
                  {workload.namespace}
                </TableCell>
                <TableCell>
                  <div className="flex min-w-56 flex-col gap-1">
                    <span className="truncate font-medium">
                      {workload.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {workload.kind}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge
                    status={
                      workload.readyReplicas === workload.desiredReplicas
                        ? "ok"
                        : "stale"
                    }
                    label={`${workload.readyReplicas}/${workload.desiredReplicas}`}
                  />
                </TableCell>
                <TableCell className="font-mono">
                  {workload.restartCount}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function VmPanel({ envelope }: { envelope: CollectEnvelope<VmsData, "vms"> }) {
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

function ArgoPanel({
  envelope,
}: {
  envelope: CollectEnvelope<ArgoCdData, "argocd">
}) {
  return (
    <Card size="sm" className="rounded-md">
      <CardHeader>
        <CardTitle>Argo CD Applications</CardTitle>
        <CardDescription>Full configured application set</CardDescription>
        <CardAction>
          <StatusBadge status={envelope.status} stale={envelope.stale} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Application</TableHead>
              <TableHead>Sync</TableHead>
              <TableHead>Health</TableHead>
              <TableHead>Revision</TableHead>
              <TableHead>Link</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {envelope.data.applications.map((app) => (
              <TableRow key={app.name}>
                <TableCell>
                  <div className="flex min-w-44 flex-col gap-1">
                    <span className="truncate font-medium">{app.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {app.namespace}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge
                    status={app.syncStatus === "Synced" ? "ok" : "stale"}
                    label={app.syncStatus}
                  />
                </TableCell>
                <TableCell>
                  <StatusBadge
                    status={app.healthStatus === "Healthy" ? "ok" : "stale"}
                    label={app.healthStatus}
                  />
                </TableCell>
                <TableCell className="font-mono">
                  {app.revision ?? "unknown"}
                </TableCell>
                <TableCell>
                  <ExternalLinkButton href={app.link} label={app.name} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function GitLabPanel({
  envelope,
}: {
  envelope: CollectEnvelope<GitLabData, "gitlab">
}) {
  return (
    <Card size="sm" className="rounded-md">
      <CardHeader>
        <CardTitle>GitLab Projects</CardTitle>
        <CardDescription>App repositories only</CardDescription>
        <CardAction>
          <StatusBadge status={envelope.status} stale={envelope.stale} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Commit</TableHead>
              <TableHead>Pipeline</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>Link</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {envelope.data.projects.map((project) => (
              <TableRow key={project.path}>
                <TableCell>
                  <div className="flex min-w-52 flex-col gap-1">
                    <span className="truncate font-medium">{project.name}</span>
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      {project.path}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex min-w-56 flex-col gap-1">
                    <span className="truncate">
                      {project.latestCommit?.title ?? "No commit snapshot"}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {project.latestCommit?.sha ?? "unknown"}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge
                    status={
                      project.latestPipeline?.status === "success"
                        ? "ok"
                        : project.latestPipeline
                          ? "stale"
                          : "unknown"
                    }
                    label={project.latestPipeline?.status ?? "missing"}
                  />
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {project.latestPipeline
                    ? formatDateTime(project.latestPipeline.updatedAt)
                    : "unknown"}
                </TableCell>
                <TableCell>
                  <ExternalLinkButton
                    href={project.link || "#"}
                    label={project.name}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function NexusPanel({
  envelope,
}: {
  envelope: CollectEnvelope<NexusData, "nexus">
}) {
  return (
    <Card size="sm" className="max-w-3xl rounded-md">
      <CardHeader>
        <CardTitle>Nexus Availability</CardTitle>
        <CardDescription>{envelope.data.url}</CardDescription>
        <CardAction>
          <StatusBadge status={envelope.status} stale={envelope.stale} />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        <Fact
          label="Reachable"
          value={envelope.data.reachable ? "yes" : "no"}
        />
        <Fact
          label="HTTP"
          value={envelope.data.httpStatus?.toString() ?? "unknown"}
        />
        <Fact label="Checked" value={formatDateTime(envelope.data.checkedAt)} />
      </CardContent>
    </Card>
  )
}

function PlatformHealthPanel({ snapshot }: { snapshot: DashboardSnapshot }) {
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
                envelope.status === "ok" || envelope.status === "stale"
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

function SourceHealthCard({ snapshot }: { snapshot: DashboardSnapshot }) {
  return (
    <Card size="sm" className="rounded-md">
      <CardHeader>
        <CardTitle>Source Health</CardTitle>
        <CardDescription>Failure and stale states</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {snapshot.overview.data.sources.map((source) => (
          <div
            key={source.source}
            className="flex items-center justify-between gap-3 rounded-md border bg-background/60 p-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <StatusDot status={source.status} stale={source.stale} />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {sourceLabels[source.source]}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {source.error?.message ??
                    `Collected ${formatDateTime(source.collectedAt)}`}
                </div>
              </div>
            </div>
            <StatusBadge status={source.status} stale={source.stale} />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function MetricCard({
  title,
  value,
  detail,
  status,
  stale,
}: {
  title: string
  value: string
  detail: string
  status: SourceStatus
  stale?: boolean
}) {
  return (
    <Card size="sm" className="rounded-md">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardAction>
          <StatusDot status={status} stale={stale} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="font-mono text-3xl font-semibold tracking-normal">
          {value}
        </div>
        <div className="truncate text-xs text-muted-foreground">{detail}</div>
      </CardContent>
    </Card>
  )
}

function SidebarItem({
  icon: Icon,
  label,
  active,
  status,
  stale,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  active?: boolean
  status?: SourceStatus
  stale?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="size-4 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      {status ? <StatusDot status={status} stale={stale} /> : null}
    </button>
  )
}

function ResourceBar({
  label,
  value,
  fallback,
}: {
  label: string
  value: number | null
  fallback: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">
          {value === null ? fallback : `${value}%`}
        </span>
      </div>
      <Progress value={value ?? 0} />
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background/60 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-mono text-sm">{value}</div>
    </div>
  )
}

function ExternalLinkButton({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild variant="outline" size="icon-xs">
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${label}`}
      >
        <ExternalLink data-icon="inline-start" />
      </a>
    </Button>
  )
}

function HealthBadge({
  health,
}: {
  health: OverviewData["health"] | undefined
}) {
  if (!health) {
    return <Badge variant="outline">loading</Badge>
  }

  return (
    <Badge variant={health === "ok" ? "secondary" : "outline"}>
      <StatusDot status={health === "ok" ? "ok" : "stale"} />
      {health}
    </Badge>
  )
}

function StatusBadge({
  status,
  stale,
  label,
}: {
  status: SourceStatus
  stale?: boolean
  label?: string
}) {
  return (
    <Badge variant={badgeVariant(status, stale)}>
      <StatusDot status={status} stale={stale} />
      {label ?? (stale ? "STALE" : statusLabels[status])}
    </Badge>
  )
}

function StatusDot({
  status,
  stale,
}: {
  status: SourceStatus
  stale?: boolean
}) {
  return (
    <span
      className="size-2 shrink-0 rounded-full"
      style={{
        backgroundColor: statusColor(status, stale),
      }}
    />
  )
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} size="sm" className="rounded-md">
            <CardHeader>
              <Skeleton className="h-4 w-28" />
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-36" />
            </CardContent>
          </Card>
        ))}
      </section>
      <Card size="sm" className="rounded-md">
        <CardHeader>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-64" />
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

async function loadSnapshot(force = false): Promise<DashboardSnapshot> {
  const url = force ? "/api/collect/snapshot?force=true" : "/api/collect/snapshot"
  const response = await fetch(url, { cache: "no-store" })

  if (!response.ok) {
    throw new Error(`Collect snapshot API returned ${response.status}`)
  }

  return response.json() as Promise<DashboardSnapshot>
}

function badgeVariant(status: SourceStatus, stale?: boolean) {
  if (status === "down") {
    return "destructive"
  }

  if (status === "ok" && !stale) {
    return "secondary"
  }

  return "outline"
}

function statusColor(status: SourceStatus, stale?: boolean) {
  if (stale || status === "stale" || status === "timeout") {
    return "var(--status-warn)"
  }

  if (status === "ok") {
    return "var(--status-ok)"
  }

  if (status === "down" || status === "permission_error") {
    return "var(--status-down)"
  }

  return "var(--status-muted)"
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "not collected"
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value))
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value))
}
