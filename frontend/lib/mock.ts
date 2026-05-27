import type { DashboardSnapshot } from "@/components/dashboard/lib/types"
import type {
  ArgoCdData,
  CollectEnvelope,
  GitLabData,
  KubernetesData,
  NexusData,
  OverviewData,
  SourceSummary,
  VmsData,
} from "@/lib/collect/types"
import type {
  ArgoCDIntegration,
  GitLabIntegration,
  IPAMAddress,
  IPAMLocation,
  IPAMNetwork,
  IPAMScanHistory,
  IPAMScanHistoryChange,
  IPAMSubnet,
  KubernetesIntegration,
  NexusIntegration,
  User,
  VMResource,
} from "@/lib/types"

const mockUserCreatedAt = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()

export const mockUser: User = {
  id: "user-admin",
  username: "omni-admin",
  role: "admin",
  mustChangePassword: false,
  createdAt: mockUserCreatedAt,
  updatedAt: mockUserCreatedAt,
}

export function isMockMode() {
  if (process.env.NODE_ENV !== "development") {
    return false
  }
  if (process.env.NEXT_PUBLIC_OMNI_MOCK === "true") {
    return true
  }
  if (typeof window === "undefined") {
    return false
  }
  const flag = new URLSearchParams(window.location.search).get("mock")
  return flag === "1" || flag === "true"
}

export function getMockViewParam() {
  if (typeof window === "undefined") {
    return null
  }
  return new URLSearchParams(window.location.search).get("view")
}

type MockStore = {
  vms: VMResource[]
  kubernetes: KubernetesIntegration[]
  argocd: ArgoCDIntegration[]
  gitlab: GitLabIntegration[]
  nexus: NexusIntegration[]
  users: User[]
  ipamLocations: IPAMLocation[]
  ipamNetworks: IPAMNetwork[]
  ipamSubnets: IPAMSubnet[]
  ipamAddresses: IPAMAddress[]
  ipamScanHistory: IPAMScanHistory[]
  ipamScanHistoryChanges: IPAMScanHistoryChange[]
}

let mockStore: MockStore | null = null

export function getMockStore(): MockStore {
  if (!mockStore) {
    mockStore = createDefaultMockStore()
  }
  return mockStore
}

function createDefaultMockStore(): MockStore {
  const createdAt = mockUserCreatedAt
  const updatedAt = mockUserCreatedAt

  const ipamScanHistory: IPAMScanHistory[] = [
    {
      id: "scan-platform-core-1",
      subnetId: "subnet-platform-core",
      subnetName: "Platform Core",
      subnetCidr: "10.40.0.0/29",
      startedAt: createdAt,
      completedAt: updatedAt,
      status: "completed",
      total: 6,
      used: 4,
      offline: 1,
      free: 1,
      error: null,
    },
    {
      id: "scan-office-users-1",
      subnetId: "subnet-office-users",
      subnetName: "Office Users",
      subnetCidr: "10.40.10.0/28",
      startedAt: createdAt,
      completedAt: updatedAt,
      status: "failed",
      total: null,
      used: null,
      offline: null,
      free: null,
      error: "ping command timed out",
    },
  ]

  const ipamScanHistoryChanges: IPAMScanHistoryChange[] = [
    {
      id: "scan-change-1",
      historyId: "scan-platform-core-1",
      address: "10.40.0.1",
      previousStatus: "free",
      currentStatus: "used",
      previousLastSeenAt: null,
      currentLastSeenAt: updatedAt,
      previousConsecutiveFailures: 1,
      currentConsecutiveFailures: 0,
    },
    {
      id: "scan-change-2",
      historyId: "scan-platform-core-1",
      address: "10.40.0.2",
      previousStatus: "used",
      currentStatus: "offline",
      previousLastSeenAt: createdAt,
      currentLastSeenAt: createdAt,
      previousConsecutiveFailures: 2,
      currentConsecutiveFailures: 3,
    },
  ]

  return {
    vms: [
      {
        id: "vm-bastion",
        name: "bastion",
        address: "10.40.0.12",
        description: "Shared access node",
        active: true,
      },
      {
        id: "vm-build",
        name: "ci-runner",
        address: "10.40.0.21",
        description: "Pipeline executor",
        active: true,
      },
    ],
    kubernetes: [
      {
        id: "k8s-primary",
        name: "Primary Cluster",
        apiUrl: "https://k8s.local",
        namespaces: ["platform", "apps"],
        active: true,
        tokenConfigured: true,
      },
    ],
    argocd: [
      {
        id: "argocd-main",
        name: "Main ArgoCD",
        baseUrl: "https://argocd.local",
        active: true,
        tokenConfigured: true,
      },
    ],
    gitlab: [
      {
        id: "gitlab-main",
        name: "Omni GitLab",
        baseUrl: "https://gitlab.local",
        projects: [
          {
            id: "gitlab-omni-ui",
            name: "omni-ui",
            path: "platform/omni-ui",
            defaultBranch: "main",
            link: "https://gitlab.local/platform/omni-ui",
            active: true,
          },
          {
            id: "gitlab-omni-api",
            name: "omni-api",
            path: "platform/omni-api",
            defaultBranch: "main",
            link: "https://gitlab.local/platform/omni-api",
            active: true,
          },
        ],
        active: true,
        tokenConfigured: true,
      },
    ],
    nexus: [
      {
        id: "nexus-main",
        name: "Nexus Core",
        url: "https://nexus.local",
        active: true,
      },
    ],
    users: [
      mockUser,
      {
        id: "user-viewer",
        username: "omni-viewer",
        role: "viewer",
        mustChangePassword: true,
        createdAt,
        updatedAt,
      },
    ],
    ipamLocations: [
      {
        id: "loc-seoul",
        name: "Seoul DC",
        description: "Primary office network",
        createdAt,
        updatedAt,
      },
      {
        id: "loc-busan",
        name: "Busan Edge",
        description: "Remote edge site",
        createdAt,
        updatedAt,
      },
    ],
    ipamNetworks: [
      {
        id: "net-seoul-platform",
        locationId: "loc-seoul",
        name: "Platform",
        description: "Shared infrastructure VLANs",
        createdAt,
        updatedAt,
      },
      {
        id: "net-seoul-office",
        locationId: "loc-seoul",
        name: "Office",
        description: "Office devices",
        createdAt,
        updatedAt,
      },
      {
        id: "net-busan-edge",
        locationId: "loc-busan",
        name: "Edge",
        description: "Busan service segment",
        createdAt,
        updatedAt,
      },
    ],
    ipamSubnets: [
      {
        id: "subnet-platform-core",
        locationId: "loc-seoul",
        networkId: "net-seoul-platform",
        name: "Platform Core",
        cidr: "10.40.0.0/29",
        description: "Core platform services",
        autoDiscovery: true,
        scanIntervalSeconds: 3600,
        lastScanStartedAt: createdAt,
        lastScanCompletedAt: updatedAt,
        lastScanStatus: "ok",
        lastScanError: null,
        createdAt,
        updatedAt,
      },
      {
        id: "subnet-office-users",
        locationId: "loc-seoul",
        networkId: "net-seoul-office",
        name: "Office Users",
        cidr: "10.40.10.0/28",
        description: "Client devices",
        autoDiscovery: true,
        scanIntervalSeconds: 14400,
        lastScanStartedAt: createdAt,
        lastScanCompletedAt: updatedAt,
        lastScanStatus: "degraded",
        lastScanError: "2 addresses timed out",
        createdAt,
        updatedAt,
      },
      {
        id: "subnet-busan-services",
        locationId: "loc-busan",
        networkId: "net-busan-edge",
        name: "Busan Services",
        cidr: "10.50.0.0/29",
        description: "Edge services",
        autoDiscovery: false,
        scanIntervalSeconds: 3600,
        lastScanStartedAt: null,
        lastScanCompletedAt: null,
        lastScanStatus: null,
        lastScanError: null,
        createdAt,
        updatedAt,
      },
    ],
    ipamAddresses: [
      ...createMockIPAMAddresses("subnet-platform-core", "10.40.0", 1, 6),
      ...createMockIPAMAddresses("subnet-office-users", "10.40.10", 1, 14),
      ...createMockIPAMAddresses("subnet-busan-services", "10.50.0", 1, 6),
    ],
    ipamScanHistory,
    ipamScanHistoryChanges,
  }
}

function createMockIPAMAddresses(
  subnetId: string,
  prefix: string,
  start: number,
  count: number
): IPAMAddress[] {
  const now = new Date().toISOString()

  return Array.from({ length: count }, (_, index) => {
    const host = start + index
    const status =
      index % 9 === 0
        ? "reserved"
        : index % 7 === 0
        ? "offline"
        : index % 5 === 0
        ? "free"
        : "used"
    const isOverride = status === "reserved"

    return {
      id: `${subnetId}-${host}`,
      subnetId,
      address: `${prefix}.${host}`,
      status,
      hostname: status === "used" ? `host-${host}` : null,
      description: null,
      isOverride,
      lastScannedAt: now,
      lastSeenAt: status === "used" ? now : null,
      consecutiveFailures: status === "used" ? 0 : status === "offline" ? 3 : 1,
      createdAt: now,
      updatedAt: now,
    }
  })
}

export function createMockSnapshot(): DashboardSnapshot {
  const now = new Date()
  const nowIso = now.toISOString()
  const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000).toISOString()
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString()
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString()

  const overviewSources: SourceSummary[] = [
    {
      source: "kubernetes",
      status: "ok",
      attemptedAt: nowIso,
      collectedAt: nowIso,
      stale: false,
      error: null,
    },
    {
      source: "vms",
      status: "ok",
      attemptedAt: twoMinutesAgo,
      collectedAt: twoMinutesAgo,
      stale: false,
      error: null,
    },
    {
      source: "argocd",
      status: "progressing",
      attemptedAt: fiveMinutesAgo,
      collectedAt: fiveMinutesAgo,
      stale: false,
      error: null,
    },
    {
      source: "gitlab",
      status: "stale",
      attemptedAt: tenMinutesAgo,
      collectedAt: tenMinutesAgo,
      stale: true,
      error: null,
    },
    {
      source: "nexus",
      status: "down",
      attemptedAt: nowIso,
      collectedAt: tenMinutesAgo,
      stale: false,
      error: { code: "CONNECTION_FAILED", message: "Connection refused" },
    },
  ]

  const overview: CollectEnvelope<OverviewData, "overview"> = {
    source: "overview",
    status: "ok",
    attemptedAt: nowIso,
    collectedAt: nowIso,
    stale: false,
    error: null,
    data: {
      health: "degraded",
      generatedAt: nowIso,
      sources: overviewSources,
    },
  }

  const kubernetesData: KubernetesData = {
    name: "omni-prod",
    nodes: [
      {
        integrationName: "Primary Cluster",
        name: "k8s-node-1",
        ready: true,
        cpuUsagePercent: 42,
        memoryUsagePercent: 61,
      },
      {
        integrationName: "Primary Cluster",
        name: "k8s-node-2",
        ready: false,
        cpuUsagePercent: 78,
        memoryUsagePercent: 84,
      },
    ],
    namespaces: ["platform", "apps", "default"],
    workloads: [
      {
        integrationName: "Primary Cluster",
        namespace: "platform",
        kind: "deployment",
        name: "omni-api",
        readyReplicas: 3,
        desiredReplicas: 3,
        replicas: 3,
        updatedReplicas: 3,
        availableReplicas: 3,
        unavailableReplicas: 0,
        progressing: false,
        restartCount: 1,
      },
      {
        integrationName: "Primary Cluster",
        namespace: "apps",
        kind: "statefulset",
        name: "gitlab-runner",
        readyReplicas: 1,
        desiredReplicas: 1,
        replicas: 1,
        updatedReplicas: 1,
        availableReplicas: 1,
        unavailableReplicas: 0,
        progressing: false,
        restartCount: 0,
      },
      {
        integrationName: "Primary Cluster",
        namespace: "apps",
        kind: "deployment",
        name: "metrics-gateway",
        readyReplicas: 1,
        desiredReplicas: 2,
        replicas: 2,
        updatedReplicas: 2,
        availableReplicas: 1,
        unavailableReplicas: 1,
        progressing: true,
        restartCount: 3,
      },
    ],
    pods: {
      total: 86,
      ready: 79,
      notReady: 5,
      restarting: 2,
    },
    services: {
      total: 24,
    },
    ingresses: {
      total: 4,
      hosts: ["omni.local", "grafana.local"],
    },
    pvcs: {
      total: 12,
      bound: 11,
      pending: 1,
    },
  }

  const kubernetes: CollectEnvelope<KubernetesData, "kubernetes"> = {
    source: "kubernetes",
    status: "ok",
    attemptedAt: nowIso,
    collectedAt: nowIso,
    stale: false,
    error: null,
    data: kubernetesData,
  }

  const vms: CollectEnvelope<VmsData, "vms"> = {
    source: "vms",
    status: "ok",
    attemptedAt: twoMinutesAgo,
    collectedAt: twoMinutesAgo,
    stale: false,
    error: null,
    data: {
      items: [
        {
          id: "vm-bastion",
          name: "bastion",
          address: "10.40.0.12",
          description: "Shared access node",
          state: "up",
          lastCheckedAt: twoMinutesAgo,
        },
        {
          id: "vm-build",
          name: "ci-runner",
          address: "10.40.0.21",
          description: "Pipeline executor",
          state: "down",
          lastCheckedAt: fiveMinutesAgo,
        },
      ],
    },
  }

  const argocd: CollectEnvelope<ArgoCdData, "argocd"> = {
    source: "argocd",
    status: "progressing",
    attemptedAt: fiveMinutesAgo,
    collectedAt: fiveMinutesAgo,
    stale: false,
    error: null,
    data: {
      applications: [
        {
          integrationName: "Main ArgoCD",
          name: "omni-api",
          namespace: "platform",
          syncStatus: "Synced",
          healthStatus: "Healthy",
          revision: "main@58fd2c1",
          link: "https://argocd.local/applications/omni-api",
        },
        {
          integrationName: "Main ArgoCD",
          name: "metrics-stack",
          namespace: "apps",
          syncStatus: "OutOfSync",
          healthStatus: "Progressing",
          revision: null,
          link: "https://argocd.local/applications/metrics-stack",
        },
      ],
    },
  }

  const gitlab: CollectEnvelope<GitLabData, "gitlab"> = {
    source: "gitlab",
    status: "stale",
    attemptedAt: tenMinutesAgo,
    collectedAt: tenMinutesAgo,
    stale: true,
    error: null,
    data: {
      projects: [
        {
          integrationName: "Omni GitLab",
          name: "omni-ui",
          path: "platform/omni-ui",
          defaultBranch: "main",
          link: "https://gitlab.local/platform/omni-ui",
          latestCommit: {
            sha: "58fd2c1",
            title: "feat: refresh dashboard layout",
            authorName: "Dev Ops",
            committedAt: tenMinutesAgo,
          },
          latestPipeline: {
            id: 342,
            status: "success",
            ref: "main",
            updatedAt: tenMinutesAgo,
            link: "https://gitlab.local/platform/omni-ui/pipelines/342",
          },
        },
        {
          integrationName: "Omni GitLab",
          name: "omni-api",
          path: "platform/omni-api",
          defaultBranch: "main",
          link: "https://gitlab.local/platform/omni-api",
          latestCommit: {
            sha: "a3e1b92",
            title: "fix: retry collector errors",
            authorName: "SRE Team",
            committedAt: fiveMinutesAgo,
          },
          latestPipeline: {
            id: 341,
            status: "running",
            ref: "main",
            updatedAt: fiveMinutesAgo,
            link: "https://gitlab.local/platform/omni-api/pipelines/341",
          },
        },
      ],
    },
  }

  const nexus: CollectEnvelope<NexusData, "nexus"> = {
    source: "nexus",
    status: "down",
    attemptedAt: nowIso,
    collectedAt: tenMinutesAgo,
    stale: false,
    error: { code: "CONNECTION_FAILED", message: "Connection refused" },
    data: {
      items: [
        {
          id: "nexus-main",
          integrationName: "Nexus Core",
          url: "https://nexus.local",
          reachable: false,
          httpStatus: null,
          checkedAt: tenMinutesAgo,
        },
      ],
      url: "https://nexus.local",
      reachable: false,
      httpStatus: null,
      checkedAt: tenMinutesAgo,
    },
  }

  return {
    overview,
    vms,
    kubernetes,
    argocd,
    gitlab,
    nexus,
  }
}
