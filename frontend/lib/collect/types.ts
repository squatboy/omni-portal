export type CollectSource =
  | "overview"
  | "vms"
  | "kubernetes"
  | "argocd"
  | "gitlab"
  | "nexus"

export type SourceStatus =
  | "ok"
  | "progressing"
  | "down"
  | "timeout"
  | "permission_error"
  | "stale"
  | "unknown"

export type OverviewHealth = "ok" | "degraded" | "unknown"

export type CollectErrorCode =
  | "TIMEOUT"
  | "PERMISSION_DENIED"
  | "CONNECTION_FAILED"
  | "UNKNOWN_ERROR"

export type CollectError = {
  code: CollectErrorCode
  message: string
}

export type CollectEnvelope<
  TData,
  TSource extends CollectSource = CollectSource,
> = {
  source: TSource
  status: SourceStatus
  attemptedAt: string
  collectedAt: string | null
  stale: boolean
  error: CollectError | null
  data: TData
}

export type SourceSummary = {
  source: Exclude<CollectSource, "overview">
  status: SourceStatus
  attemptedAt: string
  collectedAt: string | null
  stale: boolean
  error: CollectError | null
}

export type OverviewData = {
  health: OverviewHealth
  generatedAt: string
  sources: SourceSummary[]
}

export type VmInventoryItem = {
  id: string
  name: string
  address: string
  description?: string
  link?: string
}

export type VmPingState = "up" | "down" | "unknown"

export type VmStatus = VmInventoryItem & {
  state: VmPingState
  lastCheckedAt: string
}

export type VmsData = {
  items: VmStatus[]
}

export type KubernetesInventoryConfig = {
  clusterName: string
  namespaces: string[]
  appNamespaces: string[]
}

export type KubernetesNodeStatus = {
  name: string
  ready: boolean
  cpuUsagePercent: number | null
  memoryUsagePercent: number | null
}

export type KubernetesWorkloadStatus = {
  namespace: string
  kind: "deployment" | "statefulset" | "daemonset"
  name: string
  readyReplicas: number
  desiredReplicas: number
  replicas: number
  updatedReplicas: number
  availableReplicas: number
  unavailableReplicas: number
  progressing: boolean
  restartCount: number
}

export type KubernetesData = {
  clusterName: string
  nodes: KubernetesNodeStatus[]
  namespaces: string[]
  workloads: KubernetesWorkloadStatus[]
  appWorkloads: KubernetesWorkloadStatus[]
  pods: {
    total: number
    ready: number
    notReady: number
    restarting: number
  }
  services: {
    total: number
  }
  ingresses: {
    total: number
    hosts: string[]
  }
  pvcs: {
    total: number
    bound: number
    pending: number
  }
}

export type ArgoCdApplication = {
  name: string
  namespace: string
  syncStatus: "Synced" | "OutOfSync" | "Unknown"
  healthStatus: "Healthy" | "Progressing" | "Degraded" | "Unknown"
  revision: string | null
  link: string
}

export type ArgoCdData = {
  applications: ArgoCdApplication[]
}

export type GitLabProjectTarget = {
  name: string
  path: string
  defaultBranch: string
  link?: string
}

export type GitLabProjectStatus = GitLabProjectTarget & {
  latestCommit: {
    sha: string
    title: string
    authorName: string
    committedAt: string
  } | null
  latestPipeline: {
    id: number
    status:
      | "success"
      | "failed"
      | "running"
      | "pending"
      | "canceled"
      | "unknown"
    ref: string
    updatedAt: string
    link: string
  } | null
}

export type GitLabData = {
  projects: GitLabProjectStatus[]
}

export type NexusData = {
  url: string
  reachable: boolean
  httpStatus: number | null
  checkedAt: string
}

export type CollectInventoryConfig = {
  vms: VmInventoryItem[]
  kubernetes: KubernetesInventoryConfig
  argocd: {
    baseUrl: string
  }
  gitlab: {
    baseUrl: string
    projects: GitLabProjectTarget[]
  }
  nexus: {
    url: string
  }
}

export type CollectPayloadBySource = {
  overview: OverviewData
  vms: VmsData
  kubernetes: KubernetesData
  argocd: ArgoCdData
  gitlab: GitLabData
  nexus: NexusData
}

export type SourceEnvelope<TSource extends CollectSource> = CollectEnvelope<
  CollectPayloadBySource[TSource],
  TSource
>

export type RuntimeCollectSource = Exclude<CollectSource, "overview">

export type RuntimeSourceEnvelope = {
  [TSource in RuntimeCollectSource]: SourceEnvelope<TSource>
}[RuntimeCollectSource]

export type SourceEnvelopeMap = {
  [TSource in RuntimeCollectSource]: SourceEnvelope<TSource>
}
