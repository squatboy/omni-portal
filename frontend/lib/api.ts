import type {
  ArgoCDIntegration,
  AuthMe,
  GitLabIntegration,
  IPAMAddress,
  IPAMScanSummary,
  IPAMLocation,
  IPAMNetwork,
  IPAMSubnet,
  IPAMSummary,
  KubernetesIntegration,
  NexusIntegration,
  User,
  VMResource,
} from "@/lib/types"
import { getMockStore, isMockMode, mockUser } from "@/lib/mock"

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string | { message?: string }
    } | null
    const message =
      typeof payload?.error === "string" ? payload.error : payload?.error?.message
    throw new Error(message ?? `Request failed: ${response.status}`)
  }

  return response.json() as Promise<T>
}

function mockResponse<T>(value: T) {
  return Promise.resolve(value)
}

function generateId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

function compactPayload<T extends Record<string, unknown>>(payload: T): T {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [
      key,
      value === "" ? null : value,
    ])
  ) as T
}

function queryString(params: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value)
    }
  }
  const query = searchParams.toString()
  return query ? `?${query}` : ""
}

function buildIPAMSummary(): IPAMSummary {
  const store = getMockStore()
  const counts = store.ipamAddresses.reduce(
    (acc, address) => {
      acc.total += 1
      acc[address.status] += 1
      return acc
    },
    { total: 0, active: 0, dead: 0, offline: 0 }
  )

  return {
    locations: store.ipamLocations.length,
    networks: store.ipamNetworks.length,
    subnets: store.ipamSubnets.length,
    addresses: counts,
  }
}

function updateMockItem<T extends { id: string }>(
  items: T[],
  prefix: string,
  payload: T
) {
  const now = new Date().toISOString()
  const next = {
    ...payload,
    id: payload.id || generateId(prefix),
    updatedAt: now,
    createdAt:
      "createdAt" in payload && payload.createdAt ? payload.createdAt : now,
  }
  const index = items.findIndex((item) => item.id === next.id)
  if (index >= 0) {
    items[index] = next
  } else {
    items.push(next)
  }
  return next
}

function resolveTokenConfigured(
  token: string | undefined,
  incoming: boolean,
  existing?: boolean
) {
  if (token && token.trim().length > 0) {
    return true
  }
  if (existing !== undefined) {
    return existing
  }
  return incoming
}

export const api = {
  me: () => {
    if (isMockMode()) {
      return mockResponse<AuthMe>({
        authenticated: true,
        setupRequired: false,
        user: mockUser,
      })
    }
    return request<AuthMe>("/api/auth/me")
  },
  setup: (payload: { username: string; password: string }) =>
    isMockMode()
      ? mockResponse({ user: mockUser })
      : request<{ user: User }>("/api/auth/setup", {
          method: "POST",
          body: JSON.stringify(payload),
        }),
  login: (payload: { username: string; password: string }) =>
    isMockMode()
      ? mockResponse({ user: mockUser })
      : request<{ user: User }>("/api/auth/login", {
          method: "POST",
          body: JSON.stringify(payload),
        }),
  logout: () =>
    isMockMode()
      ? mockResponse({ ok: true })
      : request<{ ok: true }>("/api/auth/logout", {
          method: "POST",
          body: JSON.stringify({}),
        }),
  listVMs: () =>
    isMockMode()
      ? mockResponse(getMockStore().vms)
      : request<VMResource[]>("/api/manage/resources/vms"),
  saveVM: (payload: VMResource) => {
    if (!isMockMode()) {
      return request<VMResource>("/api/manage/resources/vms", {
        method: "POST",
        body: JSON.stringify(payload),
      })
    }
    const store = getMockStore()
    const next = {
      ...payload,
      id: payload.id || generateId("vm"),
    }
    const index = store.vms.findIndex((vm) => vm.id === next.id)
    if (index >= 0) {
      store.vms[index] = next
    } else {
      store.vms.push(next)
    }
    return mockResponse(next)
  },
  deleteVM: (id: string) => {
    if (!isMockMode()) {
      return request<{ ok: true }>(`/api/manage/resources/vms/${id}`, {
        method: "DELETE",
      })
    }
    const store = getMockStore()
    store.vms = store.vms.filter((vm) => vm.id !== id)
    return mockResponse({ ok: true })
  },
  listKubernetes: () =>
    isMockMode()
      ? mockResponse(getMockStore().kubernetes)
      : request<KubernetesIntegration[]>("/api/manage/integrations/kubernetes"),
  saveKubernetes: (payload: KubernetesIntegration & { token?: string }) => {
    if (!isMockMode()) {
      return request<KubernetesIntegration>("/api/manage/integrations/kubernetes", {
        method: "POST",
        body: JSON.stringify(payload),
      })
    }
    const store = getMockStore()
    const { token, ...rest } = payload
    const existing = store.kubernetes.find((item) => item.id === rest.id)
    const next = {
      ...rest,
      id: rest.id || generateId("k8s"),
      tokenConfigured: resolveTokenConfigured(
        token,
        rest.tokenConfigured,
        existing?.tokenConfigured
      ),
    }
    const index = store.kubernetes.findIndex((item) => item.id === next.id)
    if (index >= 0) {
      store.kubernetes[index] = next
    } else {
      store.kubernetes.push(next)
    }
    return mockResponse(next)
  },
  testKubernetes: (payload: KubernetesIntegration & { token?: string }) =>
    isMockMode()
      ? mockResponse({ ok: true, status: "ok", error: null })
      : request<TestResult>("/api/manage/integrations/kubernetes/test", {
          method: "POST",
          body: JSON.stringify(payload),
        }),
  deleteKubernetes: (id: string) => {
    if (!isMockMode()) {
      return request<{ ok: true }>(`/api/manage/integrations/kubernetes/${id}`, {
        method: "DELETE",
      })
    }
    const store = getMockStore()
    store.kubernetes = store.kubernetes.filter((item) => item.id !== id)
    return mockResponse({ ok: true })
  },
  listArgoCD: () =>
    isMockMode()
      ? mockResponse(getMockStore().argocd)
      : request<ArgoCDIntegration[]>("/api/manage/integrations/argocd"),
  saveArgoCD: (payload: ArgoCDIntegration & { token?: string }) => {
    if (!isMockMode()) {
      return request<ArgoCDIntegration>("/api/manage/integrations/argocd", {
        method: "POST",
        body: JSON.stringify(payload),
      })
    }
    const store = getMockStore()
    const { token, ...rest } = payload
    const existing = store.argocd.find((item) => item.id === rest.id)
    const next = {
      ...rest,
      id: rest.id || generateId("argocd"),
      tokenConfigured: resolveTokenConfigured(
        token,
        rest.tokenConfigured,
        existing?.tokenConfigured
      ),
    }
    const index = store.argocd.findIndex((item) => item.id === next.id)
    if (index >= 0) {
      store.argocd[index] = next
    } else {
      store.argocd.push(next)
    }
    return mockResponse(next)
  },
  testArgoCD: (payload: ArgoCDIntegration & { token?: string }) =>
    isMockMode()
      ? mockResponse({ ok: true, status: "ok", error: null })
      : request<TestResult>("/api/manage/integrations/argocd/test", {
          method: "POST",
          body: JSON.stringify(payload),
        }),
  deleteArgoCD: (id: string) => {
    if (!isMockMode()) {
      return request<{ ok: true }>(`/api/manage/integrations/argocd/${id}`, {
        method: "DELETE",
      })
    }
    const store = getMockStore()
    store.argocd = store.argocd.filter((item) => item.id !== id)
    return mockResponse({ ok: true })
  },
  listGitLab: () =>
    isMockMode()
      ? mockResponse(getMockStore().gitlab)
      : request<GitLabIntegration[]>("/api/manage/integrations/gitlab"),
  saveGitLab: (payload: GitLabIntegration & { token?: string }) => {
    if (!isMockMode()) {
      return request<GitLabIntegration>("/api/manage/integrations/gitlab", {
        method: "POST",
        body: JSON.stringify(payload),
      })
    }
    const store = getMockStore()
    const { token, ...rest } = payload
    const existing = store.gitlab.find((item) => item.id === rest.id)
    const next = {
      ...rest,
      id: rest.id || generateId("gitlab"),
      tokenConfigured: resolveTokenConfigured(
        token,
        rest.tokenConfigured,
        existing?.tokenConfigured
      ),
    }
    const index = store.gitlab.findIndex((item) => item.id === next.id)
    if (index >= 0) {
      store.gitlab[index] = next
    } else {
      store.gitlab.push(next)
    }
    return mockResponse(next)
  },
  testGitLab: (payload: GitLabIntegration & { token?: string }) =>
    isMockMode()
      ? mockResponse({ ok: true, status: "ok", error: null })
      : request<TestResult>("/api/manage/integrations/gitlab/test", {
          method: "POST",
          body: JSON.stringify(payload),
        }),
  deleteGitLab: (id: string) => {
    if (!isMockMode()) {
      return request<{ ok: true }>(`/api/manage/integrations/gitlab/${id}`, {
        method: "DELETE",
      })
    }
    const store = getMockStore()
    store.gitlab = store.gitlab.filter((item) => item.id !== id)
    return mockResponse({ ok: true })
  },
  listNexus: () =>
    isMockMode()
      ? mockResponse(getMockStore().nexus)
      : request<NexusIntegration[]>("/api/manage/integrations/nexus"),
  saveNexus: (payload: NexusIntegration) => {
    if (!isMockMode()) {
      return request<NexusIntegration>("/api/manage/integrations/nexus", {
        method: "POST",
        body: JSON.stringify(payload),
      })
    }
    const store = getMockStore()
    const next = {
      ...payload,
      id: payload.id || generateId("nexus"),
    }
    const index = store.nexus.findIndex((item) => item.id === next.id)
    if (index >= 0) {
      store.nexus[index] = next
    } else {
      store.nexus.push(next)
    }
    return mockResponse(next)
  },
  testNexus: (payload: NexusIntegration) =>
    isMockMode()
      ? mockResponse({ ok: true, status: "ok", error: null })
      : request<TestResult>("/api/manage/integrations/nexus/test", {
          method: "POST",
          body: JSON.stringify(payload),
        }),
  deleteNexus: (id: string) => {
    if (!isMockMode()) {
      return request<{ ok: true }>(`/api/manage/integrations/nexus/${id}`, {
        method: "DELETE",
      })
    }
    const store = getMockStore()
    store.nexus = store.nexus.filter((item) => item.id !== id)
    return mockResponse({ ok: true })
  },
  listUsers: () =>
    isMockMode()
      ? mockResponse(getMockStore().users)
      : request<User[]>("/api/manage/users"),
  createUser: (payload: {
    username: string
    role: "admin" | "viewer"
    password: string
    mustChangePassword: boolean
  }) =>
    isMockMode()
      ? (() => {
          const store = getMockStore()
          const nowIso = new Date().toISOString()
          const next: User = {
            id: generateId("user"),
            username: payload.username,
            role: payload.role,
            mustChangePassword: payload.mustChangePassword,
            createdAt: nowIso,
            updatedAt: nowIso,
          }
          store.users.push(next)
          return mockResponse(next)
        })()
      : request<User>("/api/manage/users", {
          method: "POST",
          body: JSON.stringify(payload),
        }),
  ipamSummary: () =>
    isMockMode()
      ? mockResponse(buildIPAMSummary())
      : request<IPAMSummary>("/api/ipam/summary"),
  listIPAMLocations: () =>
    isMockMode()
      ? mockResponse(getMockStore().ipamLocations)
      : request<IPAMLocation[]>("/api/ipam/locations"),
  saveIPAMLocation: (payload: IPAMLocation) => {
    if (!isMockMode()) {
      const method = payload.id ? "PUT" : "POST"
      const url = payload.id
        ? `/api/manage/ipam/locations/${payload.id}`
        : "/api/manage/ipam/locations"
      return request<IPAMLocation>(url, {
        method,
        body: JSON.stringify(compactPayload(payload)),
      })
    }
    const store = getMockStore()
    return mockResponse(updateMockItem(store.ipamLocations, "loc", payload))
  },
  deleteIPAMLocation: (id: string) => {
    if (!isMockMode()) {
      return request<{ ok: true }>(`/api/manage/ipam/locations/${id}`, {
        method: "DELETE",
      })
    }
    const store = getMockStore()
    const networkIds = new Set(
      store.ipamNetworks
        .filter((network) => network.locationId === id)
        .map((network) => network.id)
    )
    const subnetIds = new Set(
      store.ipamSubnets
        .filter((subnet) => networkIds.has(subnet.networkId))
        .map((subnet) => subnet.id)
    )
    store.ipamLocations = store.ipamLocations.filter((item) => item.id !== id)
    store.ipamNetworks = store.ipamNetworks.filter(
      (item) => item.locationId !== id
    )
    store.ipamSubnets = store.ipamSubnets.filter(
      (item) => !subnetIds.has(item.id)
    )
    store.ipamAddresses = store.ipamAddresses.filter(
      (item) => !subnetIds.has(item.subnetId)
    )
    return mockResponse({ ok: true })
  },
  listIPAMNetworks: (locationId?: string) =>
    isMockMode()
      ? mockResponse(
          getMockStore().ipamNetworks.filter(
            (item) => !locationId || item.locationId === locationId
          )
        )
      : request<IPAMNetwork[]>(
          `/api/ipam/networks${queryString({ locationId })}`
        ),
  saveIPAMNetwork: (payload: IPAMNetwork) => {
    if (!isMockMode()) {
      const method = payload.id ? "PUT" : "POST"
      const url = payload.id
        ? `/api/manage/ipam/networks/${payload.id}`
        : "/api/manage/ipam/networks"
      return request<IPAMNetwork>(url, {
        method,
        body: JSON.stringify(compactPayload(payload)),
      })
    }
    const store = getMockStore()
    return mockResponse(updateMockItem(store.ipamNetworks, "net", payload))
  },
  deleteIPAMNetwork: (id: string) => {
    if (!isMockMode()) {
      return request<{ ok: true }>(`/api/manage/ipam/networks/${id}`, {
        method: "DELETE",
      })
    }
    const store = getMockStore()
    const subnetIds = new Set(
      store.ipamSubnets
        .filter((subnet) => subnet.networkId === id)
        .map((subnet) => subnet.id)
    )
    store.ipamNetworks = store.ipamNetworks.filter((item) => item.id !== id)
    store.ipamSubnets = store.ipamSubnets.filter(
      (item) => item.networkId !== id
    )
    store.ipamAddresses = store.ipamAddresses.filter(
      (item) => !subnetIds.has(item.subnetId)
    )
    return mockResponse({ ok: true })
  },
  listIPAMSubnets: (
    params: { locationId?: string; networkId?: string } = {}
  ) =>
    isMockMode()
      ? mockResponse(
          getMockStore().ipamSubnets.filter(
            (item) =>
              (!params.locationId || item.locationId === params.locationId) &&
              (!params.networkId || item.networkId === params.networkId)
          )
        )
      : request<IPAMSubnet[]>(
          `/api/ipam/subnets${queryString({
            locationId: params.locationId,
            networkId: params.networkId,
          })}`
        ),
  saveIPAMSubnet: (payload: IPAMSubnet) => {
    if (!isMockMode()) {
      const method = payload.id ? "PUT" : "POST"
      const url = payload.id
        ? `/api/manage/ipam/subnets/${payload.id}`
        : "/api/manage/ipam/subnets"
      return request<IPAMSubnet>(url, {
        method,
        body: JSON.stringify(compactPayload(payload)),
      })
    }
    const store = getMockStore()
    const network = store.ipamNetworks.find(
      (item) => item.id === payload.networkId
    )
    const next = updateMockItem(store.ipamSubnets, "subnet", {
      ...payload,
      locationId: network?.locationId ?? payload.locationId,
    })
    return mockResponse(next)
  },
  deleteIPAMSubnet: (id: string) => {
    if (!isMockMode()) {
      return request<{ ok: true }>(`/api/manage/ipam/subnets/${id}`, {
        method: "DELETE",
      })
    }
    const store = getMockStore()
    store.ipamSubnets = store.ipamSubnets.filter((item) => item.id !== id)
    store.ipamAddresses = store.ipamAddresses.filter(
      (item) => item.subnetId !== id
    )
    return mockResponse({ ok: true })
  },
  rescanIPAMSubnet: (id: string) =>
    isMockMode()
      ? mockResponse<IPAMScanSummary>({
          subnetId: id,
          total: getMockStore().ipamAddresses.filter(
            (address) => address.subnetId === id
          ).length,
          active: getMockStore().ipamAddresses.filter(
            (address) => address.subnetId === id && address.status === "active"
          ).length,
          dead: getMockStore().ipamAddresses.filter(
            (address) => address.subnetId === id && address.status === "dead"
          ).length,
          offline: getMockStore().ipamAddresses.filter(
            (address) => address.subnetId === id && address.status === "offline"
          ).length,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          subnet: getMockStore().ipamSubnets.find((item) => item.id === id)!,
        })
      : request<IPAMScanSummary>(`/api/manage/ipam/subnets/${id}/rescan`, {
          method: "POST",
          body: JSON.stringify({}),
        }),
  listIPAMAddresses: (subnetId: string) =>
    isMockMode()
      ? mockResponse(
          getMockStore().ipamAddresses.filter(
            (item) => item.subnetId === subnetId
          )
        )
      : request<IPAMAddress[]>(`/api/ipam/subnets/${subnetId}/addresses`),
  saveIPAMAddress: (payload: IPAMAddress) => {
    if (!isMockMode()) {
      return request<IPAMAddress>(`/api/manage/ipam/addresses/${payload.id}`, {
        method: "PUT",
        body: JSON.stringify(compactPayload(payload)),
      })
    }
    const store = getMockStore()
    const next = updateMockItem(store.ipamAddresses, "addr", payload)
    return mockResponse(next)
  },
}

export type TestResult = {
  ok: boolean
  status: string
  error: { code: string; message: string; upstreamStatus?: number } | null
}
