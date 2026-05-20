import type {
  ArgoCDIntegration,
  AuthMe,
  GitLabIntegration,
  KubernetesIntegration,
  NexusIntegration,
  User,
  VMResource,
} from "@/lib/types"

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
      error?: string
    } | null
    throw new Error(payload?.error ?? `Request failed: ${response.status}`)
  }

  return response.json() as Promise<T>
}

export const api = {
  me: () => request<AuthMe>("/api/auth/me"),
  setup: (payload: { username: string; password: string }) =>
    request<{ user: User }>("/api/auth/setup", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  login: (payload: { username: string; password: string }) =>
    request<{ user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  logout: () =>
    request<{ ok: true }>("/api/auth/logout", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  listVMs: () => request<VMResource[]>("/api/manage/resources/vms"),
  saveVM: (payload: VMResource) =>
    request<VMResource>("/api/manage/resources/vms", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteVM: (id: string) =>
    request<{ ok: true }>(`/api/manage/resources/vms/${id}`, {
      method: "DELETE",
    }),
  listKubernetes: () =>
    request<KubernetesIntegration[]>("/api/manage/integrations/kubernetes"),
  saveKubernetes: (payload: KubernetesIntegration & { token?: string }) =>
    request<KubernetesIntegration>("/api/manage/integrations/kubernetes", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  testKubernetes: (payload: KubernetesIntegration & { token?: string }) =>
    request<TestResult>("/api/manage/integrations/kubernetes/test", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteKubernetes: (id: string) =>
    request<{ ok: true }>(`/api/manage/integrations/kubernetes/${id}`, {
      method: "DELETE",
    }),
  listArgoCD: () =>
    request<ArgoCDIntegration[]>("/api/manage/integrations/argocd"),
  saveArgoCD: (payload: ArgoCDIntegration & { token?: string }) =>
    request<ArgoCDIntegration>("/api/manage/integrations/argocd", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  testArgoCD: (payload: ArgoCDIntegration & { token?: string }) =>
    request<TestResult>("/api/manage/integrations/argocd/test", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteArgoCD: (id: string) =>
    request<{ ok: true }>(`/api/manage/integrations/argocd/${id}`, {
      method: "DELETE",
    }),
  listGitLab: () =>
    request<GitLabIntegration[]>("/api/manage/integrations/gitlab"),
  saveGitLab: (payload: GitLabIntegration & { token?: string }) =>
    request<GitLabIntegration>("/api/manage/integrations/gitlab", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  testGitLab: (payload: GitLabIntegration & { token?: string }) =>
    request<TestResult>("/api/manage/integrations/gitlab/test", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteGitLab: (id: string) =>
    request<{ ok: true }>(`/api/manage/integrations/gitlab/${id}`, {
      method: "DELETE",
    }),
  listNexus: () =>
    request<NexusIntegration[]>("/api/manage/integrations/nexus"),
  saveNexus: (payload: NexusIntegration) =>
    request<NexusIntegration>("/api/manage/integrations/nexus", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  testNexus: (payload: NexusIntegration) =>
    request<TestResult>("/api/manage/integrations/nexus/test", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteNexus: (id: string) =>
    request<{ ok: true }>(`/api/manage/integrations/nexus/${id}`, {
      method: "DELETE",
    }),
  listUsers: () => request<User[]>("/api/manage/users"),
  createUser: (payload: {
    username: string
    role: "admin" | "viewer"
    password: string
    mustChangePassword: boolean
  }) =>
    request<User>("/api/manage/users", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
}

export type TestResult = {
  ok: boolean
  status: string
  error: { code: string; message: string } | null
}
