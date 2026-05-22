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
  apiUrl: string
  namespaces: string[]
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

export type IPAMAddressStatus = "active" | "dead" | "offline"

export type IPAMAddressSummary = {
  total: number
  active: number
  dead: number
  offline: number
}

export type IPAMSummary = {
  locations: number
  networks: number
  subnets: number
  addresses: IPAMAddressSummary
}

export type IPAMLocation = {
  id: string
  name: string
  description?: string | null
  createdAt?: string
  updatedAt?: string
}

export type IPAMNetwork = {
  id: string
  locationId: string
  name: string
  description?: string | null
  createdAt?: string
  updatedAt?: string
}

export type IPAMSubnet = {
  id: string
  networkId: string
  locationId?: string
  name: string
  cidr: string
  description?: string | null
  autoDiscovery: boolean
  scanIntervalSeconds: number
  lastScanStartedAt?: string | null
  lastScanCompletedAt?: string | null
  lastScanStatus?: string | null
  lastScanError?: string | null
  createdAt?: string
  updatedAt?: string
}

export type IPAMAddress = {
  id: string
  subnetId: string
  address: string
  status: IPAMAddressStatus
  hostname?: string | null
  description?: string | null
  lastScannedAt?: string | null
  lastSeenAt?: string | null
  consecutiveFailures: number
  createdAt?: string
  updatedAt?: string
}

export type IPAMScanSummary = {
  subnetId: string
  total: number
  active: number
  dead: number
  offline: number
  startedAt: string
  completedAt: string
  subnet: IPAMSubnet
}
