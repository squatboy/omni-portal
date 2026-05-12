import type {
  ArgoCdData,
  CollectEnvelope,
  GitLabData,
  KubernetesData,
  NexusData,
  SourceEnvelopeMap,
  VmsData,
} from "@/lib/collect/types"
import { buildOverviewEnvelope } from "@/lib/collect/snapshot-cache"
import { testEnv } from "@/lib/collect/test-env"

const snapshotAt = "2026-05-12T00:00:30.000Z"
const staleCollectedAt = "2026-05-12T00:00:00.000Z"

export const mockVmsEnvelope: CollectEnvelope<VmsData, "vms"> = {
  source: "vms",
  status: "ok",
  attemptedAt: snapshotAt,
  collectedAt: snapshotAt,
  stale: false,
  error: null,
  data: {
    items: [
      {
        id: "vm-nexus",
        name: "nexus",
        address: "192.168.30.30",
        description: "Nexus Repository Manager VM",
        state: "up",
        lastCheckedAt: snapshotAt,
      },
      {
        id: "vm-legacy-batch",
        name: "legacy-batch",
        address: "192.168.40.21",
        state: "down",
        lastCheckedAt: snapshotAt,
      },
    ],
  },
}

export const mockKubernetesEnvelope: CollectEnvelope<
  KubernetesData,
  "kubernetes"
> = {
  source: "kubernetes",
  status: "stale",
  attemptedAt: snapshotAt,
  collectedAt: staleCollectedAt,
  stale: true,
  error: {
    code: "TIMEOUT",
    message: "Kubernetes API request exceeded the source timeout.",
  },
  data: {
    clusterName: "dev",
    nodes: [
      {
        name: "worker01",
        ready: true,
        cpuUsagePercent: 42,
        memoryUsagePercent: 58,
      },
      {
        name: "worker02",
        ready: true,
        cpuUsagePercent: 37,
        memoryUsagePercent: 61,
      },
    ],
    namespaces: ["dev-groupware-backend", "groupware-frontend", "argocd"],
    workloads: [
      {
        namespace: "dev-groupware-backend",
        kind: "deployment",
        name: "sth-portal-member-backend",
        readyReplicas: 1,
        desiredReplicas: 1,
        restartCount: 0,
      },
      {
        namespace: "groupware-frontend",
        kind: "deployment",
        name: "sth-approval-system",
        readyReplicas: 1,
        desiredReplicas: 1,
        restartCount: 0,
      },
    ],
    appWorkloads: [
      {
        namespace: "dev-groupware-backend",
        kind: "deployment",
        name: "sth-portal-member-backend",
        readyReplicas: 1,
        desiredReplicas: 1,
        restartCount: 0,
      },
      {
        namespace: "groupware-frontend",
        kind: "deployment",
        name: "sth-approval-system",
        readyReplicas: 1,
        desiredReplicas: 1,
        restartCount: 0,
      },
    ],
    pods: {
      total: 18,
      ready: 17,
      notReady: 1,
      restarting: 0,
    },
    services: {
      total: 11,
    },
    ingresses: {
      total: 4,
      hosts: [testEnv.groupwareWebHost, testEnv.groupwareApiHost],
    },
    pvcs: {
      total: 6,
      bound: 6,
      pending: 0,
    },
  },
}

export const mockArgoCdEnvelope: CollectEnvelope<ArgoCdData, "argocd"> = {
  source: "argocd",
  status: "ok",
  attemptedAt: snapshotAt,
  collectedAt: snapshotAt,
  stale: false,
  error: null,
  data: {
    applications: [
      {
        name: "sample-spring-service-dev",
        namespace: "argocd",
        syncStatus: "Synced",
        healthStatus: "Healthy",
        revision: "75f32e9",
        link: `${testEnv.argocdBaseUrl}/applications/sample-spring-service-dev`,
      },
      {
        name: "loki-stack",
        namespace: "argocd",
        syncStatus: "Synced",
        healthStatus: "Progressing",
        revision: "a1b2c3d",
        link: `${testEnv.argocdBaseUrl}/applications/loki-stack`,
      },
    ],
  },
}

export const mockGitLabEnvelope: CollectEnvelope<GitLabData, "gitlab"> = {
  source: "gitlab",
  status: "permission_error",
  attemptedAt: snapshotAt,
  collectedAt: staleCollectedAt,
  stale: true,
  error: {
    code: "PERMISSION_DENIED",
    message:
      "GitLab API returned an authorization error for the configured projects.",
  },
  data: {
    projects: [
      {
        name: "sth-approval-system",
        path: "sth/sth-approval-system",
        defaultBranch: "main",
        link: `${testEnv.gitlabBaseUrl}/sth/sth-approval-system`,
        latestCommit: {
          sha: "8f3c9b1",
          title: "Update frontend route contract",
          authorName: "groupware-dev",
          committedAt: staleCollectedAt,
        },
        latestPipeline: {
          id: 921,
          status: "success",
          ref: "main",
          updatedAt: staleCollectedAt,
          link: `${testEnv.gitlabBaseUrl}/sth/sth-approval-system/-/pipelines/921`,
        },
      },
      {
        name: "sth-approval-system-admin",
        path: "sth/sth-approval-system-admin",
        defaultBranch: "main",
        link: `${testEnv.gitlabBaseUrl}/sth/sth-approval-system-admin`,
        latestCommit: null,
        latestPipeline: null,
      },
      {
        name: "sth-portal-member-backend",
        path: "sth/sth-portal-member-backend",
        defaultBranch: "main",
        link: `${testEnv.gitlabBaseUrl}/sth/sth-portal-member-backend`,
        latestCommit: null,
        latestPipeline: null,
      },
    ],
  },
}

export const mockNexusEnvelope: CollectEnvelope<NexusData, "nexus"> = {
  source: "nexus",
  status: "down",
  attemptedAt: snapshotAt,
  collectedAt: null,
  stale: false,
  error: {
    code: "CONNECTION_FAILED",
    message: "Nexus health endpoint is not reachable.",
  },
  data: {
    url: testEnv.nexusUrl,
    reachable: false,
    httpStatus: null,
    checkedAt: snapshotAt,
  },
}

export const mockSourceEnvelopes = {
  vms: mockVmsEnvelope,
  kubernetes: mockKubernetesEnvelope,
  argocd: mockArgoCdEnvelope,
  gitlab: mockGitLabEnvelope,
  nexus: mockNexusEnvelope,
} satisfies SourceEnvelopeMap

export const mockOverviewEnvelope = buildOverviewEnvelope(
  mockSourceEnvelopes,
  snapshotAt
)
