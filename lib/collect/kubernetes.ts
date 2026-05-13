import fs from "fs"

import { getInventoryConfig } from "@/lib/collect/config"
import type { CollectAdapterResult } from "@/lib/collect/adapters"
import type {
  KubernetesData,
  KubernetesWorkloadStatus,
} from "@/lib/collect/types"

const DEFAULT_KUBERNETES_API_URL = "https://kubernetes.default.svc"
const SERVICE_ACCOUNT_TOKEN_PATH =
  "/var/run/secrets/kubernetes.io/serviceaccount/token"

type K8sList<T> = {
  items?: T[]
}

type K8sMeta = {
  name?: string
  namespace?: string
  ownerReferences?: K8sOwnerReference[]
}

type K8sOwnerReference = {
  kind?: string
  name?: string
  controller?: boolean
}

type K8sNode = {
  metadata?: K8sMeta
  status?: {
    allocatable?: {
      cpu?: string
      memory?: string
    }
    conditions?: {
      type?: string
      status?: string
    }[]
  }
}

type K8sNamespace = {
  metadata?: K8sMeta
}

type K8sDeployment = {
  metadata?: K8sMeta
  spec?: {
    replicas?: number
  }
  status?: {
    readyReplicas?: number
  }
}

type K8sStatefulSet = K8sDeployment

type K8sDaemonSet = {
  metadata?: K8sMeta
  status?: {
    desiredNumberScheduled?: number
    numberReady?: number
  }
}

type K8sReplicaSet = {
  metadata?: K8sMeta
}

type K8sPod = {
  metadata?: K8sMeta
  status?: {
    conditions?: {
      type?: string
      status?: string
    }[]
    containerStatuses?: {
      restartCount?: number
    }[]
  }
}

type K8sService = {
  metadata?: K8sMeta
}

type K8sIngress = {
  metadata?: K8sMeta
  spec?: {
    rules?: {
      host?: string
    }[]
  }
}

type K8sPersistentVolumeClaim = {
  metadata?: K8sMeta
  status?: {
    phase?: string
  }
}

type K8sNodeMetric = {
  metadata?: K8sMeta
  usage?: {
    cpu?: string
    memory?: string
  }
}

type K8sResourceUsage = {
  cpuCores: number | null
  memoryBytes: number | null
}

export async function collectKubernetes(
  signal: AbortSignal
): Promise<CollectAdapterResult<"kubernetes">> {
  const config = getInventoryConfig()
  const kubernetesConfig = config.kubernetes
  const clusterName = kubernetesConfig.clusterName || "unknown-cluster"
  const collectedAt = new Date().toISOString()
  const emptyData = createEmptyData(clusterName)

  const token = resolveBearerToken()
  if (!token) {
    return {
      status: "permission_error",
      collectedAt,
      stale: false,
      error: {
        code: "PERMISSION_DENIED",
        message:
          "Kubernetes bearer token is missing. Set KUBERNETES_BEARER_TOKEN or run in-cluster.",
      },
      data: emptyData,
    }
  }

  const apiBaseUrl =
    process.env.KUBERNETES_API_URL?.replace(/\/$/, "") ??
    DEFAULT_KUBERNETES_API_URL
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  }

  try {
    const [
      nodesPayload,
      namespacesPayload,
      deploymentsPayload,
      statefulSetsPayload,
      daemonSetsPayload,
      replicaSetsPayload,
      podsPayload,
      servicesPayload,
      ingressesPayload,
      pvcsPayload,
      nodeMetricsPayload,
    ] = await Promise.all([
      fetchJson<K8sList<K8sNode>>(apiBaseUrl, "/api/v1/nodes", headers, signal),
      fetchJson<K8sList<K8sNamespace>>(
        apiBaseUrl,
        "/api/v1/namespaces",
        headers,
        signal
      ),
      fetchJson<K8sList<K8sDeployment>>(
        apiBaseUrl,
        "/apis/apps/v1/deployments",
        headers,
        signal
      ),
      fetchJson<K8sList<K8sStatefulSet>>(
        apiBaseUrl,
        "/apis/apps/v1/statefulsets",
        headers,
        signal
      ),
      fetchJson<K8sList<K8sDaemonSet>>(
        apiBaseUrl,
        "/apis/apps/v1/daemonsets",
        headers,
        signal
      ),
      fetchJson<K8sList<K8sReplicaSet>>(
        apiBaseUrl,
        "/apis/apps/v1/replicasets",
        headers,
        signal
      ),
      fetchJson<K8sList<K8sPod>>(apiBaseUrl, "/api/v1/pods", headers, signal),
      fetchJson<K8sList<K8sService>>(
        apiBaseUrl,
        "/api/v1/services",
        headers,
        signal
      ),
      fetchJson<K8sList<K8sIngress>>(
        apiBaseUrl,
        "/apis/networking.k8s.io/v1/ingresses",
        headers,
        signal
      ),
      fetchJson<K8sList<K8sPersistentVolumeClaim>>(
        apiBaseUrl,
        "/api/v1/persistentvolumeclaims",
        headers,
        signal
      ),
      fetchOptionalJson<K8sList<K8sNodeMetric>>(
        apiBaseUrl,
        "/apis/metrics.k8s.io/v1beta1/nodes",
        headers,
        signal
      ),
    ])

    const discoveredNamespaces = listItems(namespacesPayload)
      .map((namespace) => namespace.metadata?.name)
      .filter((value): value is string => Boolean(value))
    const configuredNamespaces = normalizeNames(kubernetesConfig.namespaces)
    const targetNamespaces =
      configuredNamespaces.length > 0 ? configuredNamespaces : discoveredNamespaces
    const targetNamespaceSet = new Set(targetNamespaces)

    const pods = filterByNamespace(listItems(podsPayload), targetNamespaceSet)
    const deployments = filterByNamespace(
      listItems(deploymentsPayload),
      targetNamespaceSet
    )
    const statefulSets = filterByNamespace(
      listItems(statefulSetsPayload),
      targetNamespaceSet
    )
    const daemonSets = filterByNamespace(
      listItems(daemonSetsPayload),
      targetNamespaceSet
    )
    const replicaSets = filterByNamespace(
      listItems(replicaSetsPayload),
      targetNamespaceSet
    )
    const services = filterByNamespace(
      listItems(servicesPayload),
      targetNamespaceSet
    )
    const ingresses = filterByNamespace(
      listItems(ingressesPayload),
      targetNamespaceSet
    )
    const pvcs = filterByNamespace(listItems(pvcsPayload), targetNamespaceSet)

    const restartByWorkload = buildRestartByWorkload(pods, replicaSets)
    const workloads = [
      ...deployments.flatMap((deployment) =>
        toWorkload("deployment", deployment, restartByWorkload)
      ),
      ...statefulSets.flatMap((statefulSet) =>
        toWorkload("statefulset", statefulSet, restartByWorkload)
      ),
      ...daemonSets.flatMap((daemonSet) =>
        toWorkload("daemonset", daemonSet, restartByWorkload)
      ),
    ].sort((left, right) => {
      if (left.namespace === right.namespace) {
        return left.name.localeCompare(right.name)
      }
      return left.namespace.localeCompare(right.namespace)
    })

    const appNamespaceConfig = normalizeNames(kubernetesConfig.appNamespaces)
    const appNamespaceSet =
      appNamespaceConfig.length > 0
        ? new Set(appNamespaceConfig)
        : targetNamespaceSet
    const appWorkloads = workloads.filter((workload) =>
      appNamespaceSet.has(workload.namespace)
    )

    const nodeUsageByName = createNodeUsageMap(listItems(nodeMetricsPayload))
    const nodes = listItems(nodesPayload).flatMap((node) => {
      const nodeName = node.metadata?.name
      if (!nodeName) {
        return []
      }

      const allocatableCpu = parseCpuCores(node.status?.allocatable?.cpu)
      const allocatableMemory = parseBytes(node.status?.allocatable?.memory)
      const usage = nodeUsageByName.get(nodeName)
      const isReady =
        node.status?.conditions?.some(
          (condition) =>
            condition.type === "Ready" && condition.status?.toLowerCase() === "true"
        ) ?? false

      return [
        {
          name: nodeName,
          ready: isReady,
          cpuUsagePercent: toPercentage(usage?.cpuCores ?? null, allocatableCpu),
          memoryUsagePercent: toPercentage(
            usage?.memoryBytes ?? null,
            allocatableMemory
          ),
        },
      ]
    })

    const readyPods = pods.filter((pod) => isPodReady(pod)).length
    const restartingPods = pods.filter((pod) => podRestartCount(pod) > 0).length
    const ingressHosts = Array.from(
      new Set(
        ingresses.flatMap((ingress) =>
          (ingress.spec?.rules ?? [])
            .map((rule) => rule.host)
            .filter((host): host is string => Boolean(host))
        )
      )
    ).sort((left, right) => left.localeCompare(right))
    const boundPvcCount = pvcs.filter(
      (pvc) => pvc.status?.phase?.toLowerCase() === "bound"
    ).length
    const pendingPvcCount = pvcs.filter(
      (pvc) => pvc.status?.phase?.toLowerCase() === "pending"
    ).length

    const notReadyPods = Math.max(0, pods.length - readyPods)
    const isStale = notReadyPods > 0 || restartingPods > 0 || pendingPvcCount > 0

    return {
      status: isStale ? "stale" : "ok",
      collectedAt,
      stale: false,
      error: null,
      data: {
        clusterName,
        nodes,
        namespaces: targetNamespaces,
        workloads,
        appWorkloads,
        pods: {
          total: pods.length,
          ready: readyPods,
          notReady: notReadyPods,
          restarting: restartingPods,
        },
        services: {
          total: services.length,
        },
        ingresses: {
          total: ingresses.length,
          hosts: ingressHosts,
        },
        pvcs: {
          total: pvcs.length,
          bound: boundPvcCount,
          pending: pendingPvcCount,
        },
      },
    }
  } catch (error) {
    const mappedError = mapKubernetesError(error)
    return {
      status:
        mappedError.code === "TIMEOUT"
          ? "timeout"
          : mappedError.code === "PERMISSION_DENIED"
            ? "permission_error"
            : "down",
      collectedAt,
      stale: false,
      error: mappedError,
      data: emptyData,
    }
  }
}

function createEmptyData(clusterName: string): KubernetesData {
  return {
    clusterName,
    nodes: [],
    namespaces: [],
    workloads: [],
    appWorkloads: [],
    pods: {
      total: 0,
      ready: 0,
      notReady: 0,
      restarting: 0,
    },
    services: {
      total: 0,
    },
    ingresses: {
      total: 0,
      hosts: [],
    },
    pvcs: {
      total: 0,
      bound: 0,
      pending: 0,
    },
  }
}

async function fetchJson<T>(
  apiBaseUrl: string,
  path: string,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers,
    signal,
  })

  if (!response.ok) {
    throw new CollectorHttpError(
      response.status,
      `Kubernetes API responded with status ${response.status} for ${path}`
    )
  }

  return (await response.json()) as T
}

async function fetchOptionalJson<T>(
  apiBaseUrl: string,
  path: string,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<T | null> {
  try {
    return await fetchJson<T>(apiBaseUrl, path, headers, signal)
  } catch (error) {
    if (error instanceof CollectorHttpError) {
      return null
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw error
    }
    return null
  }
}

function resolveBearerToken() {
  const explicitToken = process.env.KUBERNETES_BEARER_TOKEN?.trim()
  if (explicitToken) {
    return explicitToken
  }

  try {
    return fs.readFileSync(SERVICE_ACCOUNT_TOKEN_PATH, "utf-8").trim()
  } catch {
    return null
  }
}

function listItems<T>(payload: K8sList<T> | null): T[] {
  return payload?.items ?? []
}

function normalizeNames(values: string[] | undefined): string[] {
  const deduped = new Set(
    (values ?? [])
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
  )
  return Array.from(deduped)
}

function filterByNamespace<T extends { metadata?: K8sMeta }>(
  items: T[],
  namespaceSet: Set<string>
): T[] {
  if (namespaceSet.size === 0) {
    return items.filter((item) => Boolean(item.metadata?.namespace))
  }

  return items.filter((item) => {
    const namespace = item.metadata?.namespace
    return namespace ? namespaceSet.has(namespace) : false
  })
}

function buildRestartByWorkload(
  pods: K8sPod[],
  replicaSets: K8sReplicaSet[]
): Map<string, number> {
  const restartByWorkload = new Map<string, number>()
  const replicaSetToDeployment = new Map<string, string>()

  for (const replicaSet of replicaSets) {
    const namespace = replicaSet.metadata?.namespace
    const replicaSetName = replicaSet.metadata?.name
    const owner = controllerOwner(replicaSet.metadata?.ownerReferences)
    if (!namespace || !replicaSetName || owner?.kind !== "Deployment" || !owner.name) {
      continue
    }
    replicaSetToDeployment.set(`${namespace}/${replicaSetName}`, owner.name)
  }

  for (const pod of pods) {
    const namespace = pod.metadata?.namespace
    const owner = controllerOwner(pod.metadata?.ownerReferences)
    if (!namespace || !owner?.kind || !owner.name) {
      continue
    }

    let workload: {
      kind: KubernetesWorkloadStatus["kind"]
      name: string
    } | null = null

    if (owner.kind === "StatefulSet" || owner.kind === "DaemonSet") {
      workload = {
        kind: owner.kind.toLowerCase() as KubernetesWorkloadStatus["kind"],
        name: owner.name,
      }
    } else if (owner.kind === "ReplicaSet") {
      const deploymentName = replicaSetToDeployment.get(`${namespace}/${owner.name}`)
      if (deploymentName) {
        workload = {
          kind: "deployment",
          name: deploymentName,
        }
      }
    }

    if (!workload) {
      continue
    }

    const restartCount = podRestartCount(pod)
    const key = workloadKey(namespace, workload.kind, workload.name)
    restartByWorkload.set(key, (restartByWorkload.get(key) ?? 0) + restartCount)
  }

  return restartByWorkload
}

function podRestartCount(pod: K8sPod) {
  return (pod.status?.containerStatuses ?? []).reduce(
    (sum, containerStatus) => sum + (containerStatus.restartCount ?? 0),
    0
  )
}

function isPodReady(pod: K8sPod) {
  return (
    pod.status?.conditions?.some(
      (condition) =>
        condition.type === "Ready" && condition.status?.toLowerCase() === "true"
    ) ?? false
  )
}

function controllerOwner(ownerReferences?: K8sOwnerReference[]) {
  if (!ownerReferences || ownerReferences.length === 0) {
    return null
  }
  return (
    ownerReferences.find((owner) => owner.controller) ?? ownerReferences[0] ?? null
  )
}

function workloadKey(
  namespace: string,
  kind: KubernetesWorkloadStatus["kind"],
  name: string
) {
  return `${namespace}/${kind}/${name}`
}

function toWorkload(
  kind: KubernetesWorkloadStatus["kind"],
  resource: K8sDeployment | K8sStatefulSet | K8sDaemonSet,
  restartByWorkload: Map<string, number>
): KubernetesWorkloadStatus[] {
  const namespace = resource.metadata?.namespace
  const name = resource.metadata?.name
  if (!namespace || !name) {
    return []
  }

  const desiredReplicas =
    kind === "daemonset"
      ? (resource as K8sDaemonSet).status?.desiredNumberScheduled ?? 0
      : (resource as K8sDeployment | K8sStatefulSet).spec?.replicas ?? 0
  const readyReplicas =
    kind === "daemonset"
      ? (resource as K8sDaemonSet).status?.numberReady ?? 0
      : (resource as K8sDeployment | K8sStatefulSet).status?.readyReplicas ?? 0

  return [
    {
      namespace,
      kind,
      name,
      desiredReplicas,
      readyReplicas,
      restartCount: restartByWorkload.get(workloadKey(namespace, kind, name)) ?? 0,
    },
  ]
}

function createNodeUsageMap(metrics: K8sNodeMetric[]): Map<string, K8sResourceUsage> {
  const result = new Map<string, K8sResourceUsage>()

  for (const metric of metrics) {
    const nodeName = metric.metadata?.name
    if (!nodeName) {
      continue
    }
    result.set(nodeName, {
      cpuCores: parseCpuCores(metric.usage?.cpu),
      memoryBytes: parseBytes(metric.usage?.memory),
    })
  }

  return result
}

function toPercentage(
  usage: number | null,
  allocatable: number | null
): number | null {
  if (usage === null || allocatable === null || allocatable <= 0) {
    return null
  }
  return Math.round((usage / allocatable) * 100)
}

function parseCpuCores(quantity: string | undefined): number | null {
  if (!quantity) {
    return null
  }

  if (quantity.endsWith("n")) {
    return Number.parseFloat(quantity.slice(0, -1)) / 1_000_000_000
  }
  if (quantity.endsWith("u")) {
    return Number.parseFloat(quantity.slice(0, -1)) / 1_000_000
  }
  if (quantity.endsWith("m")) {
    return Number.parseFloat(quantity.slice(0, -1)) / 1_000
  }

  const parsed = Number.parseFloat(quantity)
  return Number.isFinite(parsed) ? parsed : null
}

function parseBytes(quantity: string | undefined): number | null {
  if (!quantity) {
    return null
  }

  const match = quantity.match(/^([0-9]+(?:\.[0-9]+)?)([a-zA-Z]+)?$/)
  if (!match) {
    return null
  }

  const amount = Number.parseFloat(match[1])
  const unit = match[2] ?? ""
  if (!Number.isFinite(amount)) {
    return null
  }

  if (!unit) {
    return amount
  }

  const multipliers: Record<string, number> = {
    Ki: 1024,
    Mi: 1024 ** 2,
    Gi: 1024 ** 3,
    Ti: 1024 ** 4,
    Pi: 1024 ** 5,
    Ei: 1024 ** 6,
    K: 1000,
    M: 1000 ** 2,
    G: 1000 ** 3,
    T: 1000 ** 4,
    P: 1000 ** 5,
    E: 1000 ** 6,
  }

  const multiplier = multipliers[unit]
  if (!multiplier) {
    return null
  }
  return amount * multiplier
}

function mapKubernetesError(error: unknown) {
  if (error instanceof CollectorHttpError) {
    return {
      code:
        error.status === 401 || error.status === 403
          ? ("PERMISSION_DENIED" as const)
          : ("CONNECTION_FAILED" as const),
      message: error.message,
    }
  }

  if (error instanceof Error && error.name === "AbortError") {
    return {
      code: "TIMEOUT" as const,
      message: "Kubernetes API request timed out",
    }
  }

  return {
    code: "CONNECTION_FAILED" as const,
    message:
      error instanceof Error ? error.message : "Kubernetes API request failed",
  }
}

class CollectorHttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "CollectorHttpError"
    this.status = status
  }
}
