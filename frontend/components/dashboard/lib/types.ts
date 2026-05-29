import type {
  ArgoCdData,
  CollectEnvelope,
  CollectSource,
  GitHubData,
  GitLabData,
  KubernetesData,
  NexusData,
  OverviewData,
  VmsData,
} from "@/lib/collect/types"

export type DashboardTab =
  | "overview"
  | "kubernetes"
  | "pods"
  | "vms"
  | "argocd"
  | "gitlab"
  | "github"
  | "nexus"
  | "health"

export type DashboardSnapshot = {
  overview: CollectEnvelope<OverviewData, "overview">
  vms: CollectEnvelope<VmsData, "vms">
  kubernetes: CollectEnvelope<KubernetesData, "kubernetes">
  argocd: CollectEnvelope<ArgoCdData, "argocd">
  gitlab: CollectEnvelope<GitLabData, "gitlab">
  github: CollectEnvelope<GitHubData, "github">
  nexus: CollectEnvelope<NexusData, "nexus">
}

export type SourceKey = Exclude<CollectSource, "overview">
