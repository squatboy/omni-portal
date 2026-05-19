import * as React from "react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArgoPanel } from "../panels/argo-panel"
import { GitLabPanel } from "../panels/gitlab-panel"
import { KubernetesPanel } from "../panels/kubernetes-panel"
import { NexusPanel } from "../panels/nexus-panel"
import { OverviewPanel } from "../panels/overview-panel"
import { PlatformHealthPanel } from "../panels/platform-health-panel"
import { PodsPanel } from "../panels/pods-panel"
import { VmPanel } from "../panels/vm-panel"
import type { DashboardSnapshot, DashboardTab } from "../lib/types"
import { MetricCard } from "./metric-card"

export function DashboardContent({
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
