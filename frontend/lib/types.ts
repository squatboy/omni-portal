export type User = {
  id: string
  username: string
  role: "admin" | "viewer"
  mustChangePassword: boolean
  createdAt: string
  updatedAt: string
}

export type AuthMe =
  | {
      authenticated: false
      setupRequired: boolean
    }
  | {
      authenticated: true
      setupRequired: boolean
      user: User
    }

export type VMResource = {
  id: string
  name: string
  address: string
  description?: string | null
  link?: string | null
  active: boolean
}

export type KubernetesIntegration = {
  id: string
  name: string
  clusterName: string
  apiUrl: string
  namespaces: string[]
  appNamespaces: string[]
  active: boolean
  tokenConfigured: boolean
}

export type ArgoCDIntegration = {
  id: string
  name: string
  baseUrl: string
  active: boolean
  tokenConfigured: boolean
}

export type GitLabProject = {
  id: string
  name: string
  path: string
  defaultBranch: string
  link?: string | null
  active: boolean
}

export type GitLabIntegration = {
  id: string
  name: string
  baseUrl: string
  projects: GitLabProject[]
  active: boolean
  tokenConfigured: boolean
}

export type NexusIntegration = {
  id: string
  name: string
  url: string
  active: boolean
}
