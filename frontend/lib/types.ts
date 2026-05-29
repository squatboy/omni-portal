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

export type GitHubRepository = {
  id: string
  name: string
  fullName: string
  defaultBranch: string
  link?: string | null
  active: boolean
}

export type GitHubIntegration = {
  id: string
  name: string
  baseUrl: string
  repositories: GitHubRepository[]
  active: boolean
  tokenConfigured: boolean
}

export type NexusIntegration = {
  id: string
  name: string
  url: string
  active: boolean
}

export type IPAMAddressStatus = "used" | "offline" | "free" | "reserved"

export type IPAMAddressSummary = {
  total: number
  used: number
  offline: number
  free: number
  reserved: number
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
  isOverride: boolean
  lastScannedAt?: string | null
  lastSeenAt?: string | null
  consecutiveFailures: number
  createdAt?: string
  updatedAt?: string
}

export type IPAMSearchResult = {
  id: string
  matchType: "ip" | "hostname"
  queryAddress?: string | null
  address: IPAMAddress | null
  subnet: IPAMSubnet
  network: Pick<IPAMNetwork, "id" | "name">
  location: Pick<IPAMLocation, "id" | "name">
}

export type IPAMScanSummary = {
  subnetId: string
  total: number
  used: number
  offline: number
  free: number
  startedAt: string
  completedAt: string
  subnet: IPAMSubnet
}

export type IPAMScanHistoryStatus = "completed" | "failed"

export type IPAMScanHistory = {
  id: string
  subnetId: string
  subnetName: string
  subnetCidr: string
  startedAt?: string | null
  completedAt: string
  status: IPAMScanHistoryStatus
  total?: number | null
  used?: number | null
  offline?: number | null
  free?: number | null
  reserved?: number | null
  error?: string | null
}

export type IPAMScanHistoryChange = {
  id: string
  historyId: string
  address: string
  previousStatus: IPAMAddressStatus
  currentStatus: IPAMAddressStatus
  previousLastSeenAt?: string | null
  currentLastSeenAt?: string | null
  previousConsecutiveFailures: number
  currentConsecutiveFailures: number
}

export type IPAMScanHistoryDetail = {
  history: IPAMScanHistory
  changes: IPAMScanHistoryChange[]
}
