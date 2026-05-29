package models

import "time"

type CollectSource string

const (
	SourceOverview   CollectSource = "overview"
	SourceVMs        CollectSource = "vms"
	SourceKubernetes CollectSource = "kubernetes"
	SourceArgoCD     CollectSource = "argocd"
	SourceGitLab     CollectSource = "gitlab"
	SourceGitHub     CollectSource = "github"
	SourceNexus      CollectSource = "nexus"
)

type SourceStatus string

const (
	StatusOk              SourceStatus = "ok"
	StatusProgressing     SourceStatus = "progressing"
	StatusDown            SourceStatus = "down"
	StatusTimeout         SourceStatus = "timeout"
	StatusPermissionError SourceStatus = "permission_error"
	StatusStale           SourceStatus = "stale"
	StatusUnknown         SourceStatus = "unknown"
)

type OverviewHealth string

const (
	HealthOk       OverviewHealth = "ok"
	HealthDegraded OverviewHealth = "degraded"
	HealthUnknown  OverviewHealth = "unknown"
)

type CollectErrorCode string

const (
	ErrTimeout          CollectErrorCode = "TIMEOUT"
	ErrPermissionDenied CollectErrorCode = "PERMISSION_DENIED"
	ErrConnectionFailed CollectErrorCode = "CONNECTION_FAILED"
	ErrUnknownError     CollectErrorCode = "UNKNOWN_ERROR"
)

type CollectError struct {
	Code           CollectErrorCode `json:"code"`
	Message        string           `json:"message"`
	UpstreamStatus *int             `json:"upstreamStatus,omitempty"`
}

type CollectEnvelope[T any] struct {
	Source      CollectSource `json:"source"`
	Status      SourceStatus  `json:"status"`
	AttemptedAt string        `json:"attemptedAt"`
	CollectedAt *string       `json:"collectedAt"`
	Stale       bool          `json:"stale"`
	Error       *CollectError `json:"error"`
	Data        T             `json:"data"`
}

type DashboardSnapshot struct {
	Overview   CollectEnvelope[OverviewData]   `json:"overview"`
	VMs        CollectEnvelope[VmsData]        `json:"vms"`
	Kubernetes CollectEnvelope[KubernetesData] `json:"kubernetes"`
	ArgoCD     CollectEnvelope[ArgoCdData]     `json:"argocd"`
	GitLab     CollectEnvelope[GitLabData]     `json:"gitlab"`
	GitHub     CollectEnvelope[GitHubData]     `json:"github"`
	Nexus      CollectEnvelope[NexusData]      `json:"nexus"`
}

type SourceSummary struct {
	Source      CollectSource `json:"source"`
	Status      SourceStatus  `json:"status"`
	AttemptedAt string        `json:"attemptedAt"`
	CollectedAt *string       `json:"collectedAt"`
	Stale       bool          `json:"stale"`
	Error       *CollectError `json:"error"`
}

type OverviewData struct {
	Health      OverviewHealth  `json:"health"`
	GeneratedAt string          `json:"generatedAt"`
	Sources     []SourceSummary `json:"sources"`
}

type VmInventoryItem struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Address     string  `json:"address"`
	Description *string `json:"description,omitempty"`
}

type VmPingState string

const (
	VmPingUp      VmPingState = "up"
	VmPingDown    VmPingState = "down"
	VmPingUnknown VmPingState = "unknown"
)

type VmStatus struct {
	VmInventoryItem
	State         VmPingState `json:"state"`
	LastCheckedAt string      `json:"lastCheckedAt"`
}

type VmsData struct {
	Items []VmStatus `json:"items"`
}

type KubernetesNodeStatus struct {
	IntegrationName    string   `json:"integrationName,omitempty"`
	Name               string   `json:"name"`
	Ready              bool     `json:"ready"`
	CpuUsagePercent    *float64 `json:"cpuUsagePercent"`
	MemoryUsagePercent *float64 `json:"memoryUsagePercent"`
}

type KubernetesWorkloadStatus struct {
	IntegrationName     string `json:"integrationName,omitempty"`
	Namespace           string `json:"namespace"`
	Kind                string `json:"kind"` // deployment | statefulset | daemonset
	Name                string `json:"name"`
	ReadyReplicas       int    `json:"readyReplicas"`
	DesiredReplicas     int    `json:"desiredReplicas"`
	Replicas            int    `json:"replicas"`
	UpdatedReplicas     int    `json:"updatedReplicas"`
	AvailableReplicas   int    `json:"availableReplicas"`
	UnavailableReplicas int    `json:"unavailableReplicas"`
	Progressing         bool   `json:"progressing"`
	RestartCount        int    `json:"restartCount"`
}

type PodsStatus struct {
	Total      int `json:"total"`
	Ready      int `json:"ready"`
	NotReady   int `json:"notReady"`
	Restarting int `json:"restarting"`
}

type ServicesStatus struct {
	Total int `json:"total"`
}

type IngressesStatus struct {
	Total int      `json:"total"`
	Hosts []string `json:"hosts"`
}

type PvcsStatus struct {
	Total   int `json:"total"`
	Bound   int `json:"bound"`
	Pending int `json:"pending"`
}

type KubernetesData struct {
	Name       string                     `json:"name"`
	Nodes      []KubernetesNodeStatus     `json:"nodes"`
	Namespaces []string                   `json:"namespaces"`
	Workloads  []KubernetesWorkloadStatus `json:"workloads"`
	Pods       PodsStatus                 `json:"pods"`
	Services   ServicesStatus             `json:"services"`
	Ingresses  IngressesStatus            `json:"ingresses"`
	Pvcs       PvcsStatus                 `json:"pvcs"`
}
type ArgoCdApplication struct {
	IntegrationName string  `json:"integrationName,omitempty"`
	Name            string  `json:"name"`
	Namespace       string  `json:"namespace"`
	SyncStatus      string  `json:"syncStatus"`   // Synced, OutOfSync, Unknown
	HealthStatus    string  `json:"healthStatus"` // Healthy, Progressing, Degraded, Unknown
	Revision        *string `json:"revision"`
	Link            string  `json:"link"`
}

type ArgoCdData struct {
	Applications []ArgoCdApplication `json:"applications"`
}

type GitLabProjectTarget struct {
	Name          string  `json:"name"`
	Path          string  `json:"path"`
	DefaultBranch string  `json:"defaultBranch"`
	Link          *string `json:"link,omitempty"`
}

type GitLabCommit struct {
	Sha         string `json:"sha"`
	Title       string `json:"title"`
	AuthorName  string `json:"authorName"`
	CommittedAt string `json:"committedAt"`
}

type GitLabPipeline struct {
	Id        int    `json:"id"`
	Status    string `json:"status"` // success, failed, running, pending, canceled, unknown
	Ref       string `json:"ref"`
	UpdatedAt string `json:"updatedAt"`
	Link      string `json:"link"`
}

type GitLabProjectStatus struct {
	GitLabProjectTarget
	IntegrationName string          `json:"integrationName,omitempty"`
	LatestCommit    *GitLabCommit   `json:"latestCommit"`
	LatestPipeline  *GitLabPipeline `json:"latestPipeline"`
}

type GitLabData struct {
	Projects []GitLabProjectStatus `json:"projects"`
}

type GitHubRepositoryTarget struct {
	Name          string  `json:"name"`
	FullName      string  `json:"fullName"`
	DefaultBranch string  `json:"defaultBranch"`
	Link          *string `json:"link,omitempty"`
}

type GitHubCommit struct {
	Sha         string `json:"sha"`
	Message     string `json:"message"`
	AuthorName  string `json:"authorName"`
	CommittedAt string `json:"committedAt"`
	Link        string `json:"link"`
}

type GitHubWorkflowRun struct {
	ID         int64   `json:"id"`
	Name       string  `json:"name"`
	Status     string  `json:"status"`
	Conclusion *string `json:"conclusion"`
	Branch     string  `json:"branch"`
	UpdatedAt  string  `json:"updatedAt"`
	Link       string  `json:"link"`
}

type GitHubRepositoryStatus struct {
	GitHubRepositoryTarget
	IntegrationName   string             `json:"integrationName,omitempty"`
	LatestCommit      *GitHubCommit      `json:"latestCommit"`
	LatestWorkflowRun *GitHubWorkflowRun `json:"latestWorkflowRun"`
}

type GitHubData struct {
	Repositories []GitHubRepositoryStatus `json:"repositories"`
}

type NexusData struct {
	Items      []NexusStatus `json:"items"`
	Url        string        `json:"url"`
	Reachable  bool          `json:"reachable"`
	HttpStatus *int          `json:"httpStatus"`
	CheckedAt  string        `json:"checkedAt"`
}

type NexusStatus struct {
	ID              string `json:"id"`
	IntegrationName string `json:"integrationName"`
	Url             string `json:"url"`
	Reachable       bool   `json:"reachable"`
	HttpStatus      *int   `json:"httpStatus"`
	CheckedAt       string `json:"checkedAt"`
}

type KubernetesInventoryConfig struct {
	Namespaces []string `json:"namespaces"`
}
type KubernetesCollectTarget struct {
	ID         string
	Name       string
	APIURL     string
	Token      string
	Namespaces []string
}
type GitLabCollectTarget struct {
	ID       string
	Name     string
	BaseURL  string
	Token    string
	Projects []GitLabProjectTarget
}

type GitHubCollectTarget struct {
	ID           string
	Name         string
	BaseURL      string
	Token        string
	Repositories []GitHubRepositoryTarget
}

type ArgoCDCollectTarget struct {
	ID      string
	Name    string
	BaseURL string
	Token   string
}

type NexusCollectTarget struct {
	ID   string
	Name string
	URL  string
}

type CollectSettings struct {
	VMs        []VmInventoryItem
	Kubernetes []KubernetesCollectTarget
	ArgoCD     []ArgoCDCollectTarget
	GitLab     []GitLabCollectTarget
	GitHub     []GitHubCollectTarget
	Nexus      []NexusCollectTarget
}

type UserRole string

const (
	RoleAdmin  UserRole = "admin"
	RoleViewer UserRole = "viewer"
)

type User struct {
	ID                 string   `json:"id"`
	Username           string   `json:"username"`
	Role               UserRole `json:"role"`
	MustChangePassword bool     `json:"mustChangePassword"`
	CreatedAt          string   `json:"createdAt"`
	UpdatedAt          string   `json:"updatedAt"`
}

type VMResource struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Address     string  `json:"address"`
	Description *string `json:"description,omitempty"`
	Active      bool    `json:"active"`
}

type KubernetesIntegration struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	APIURL          string   `json:"apiUrl"`
	Namespaces      []string `json:"namespaces"`
	Active          bool     `json:"active"`
	TokenConfigured bool     `json:"tokenConfigured"`
}
type GitLabIntegration struct {
	ID              string              `json:"id"`
	Name            string              `json:"name"`
	BaseURL         string              `json:"baseUrl"`
	Projects        []GitLabProjectItem `json:"projects"`
	Active          bool                `json:"active"`
	TokenConfigured bool                `json:"tokenConfigured"`
}

type GitLabProjectItem struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	Path          string  `json:"path"`
	DefaultBranch string  `json:"defaultBranch"`
	Link          *string `json:"link,omitempty"`
	Active        bool    `json:"active"`
}

type GitHubIntegration struct {
	ID              string                 `json:"id"`
	Name            string                 `json:"name"`
	BaseURL         string                 `json:"baseUrl"`
	Repositories    []GitHubRepositoryItem `json:"repositories"`
	Active          bool                   `json:"active"`
	TokenConfigured bool                   `json:"tokenConfigured"`
}

type GitHubRepositoryItem struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	FullName      string  `json:"fullName"`
	DefaultBranch string  `json:"defaultBranch"`
	Link          *string `json:"link,omitempty"`
	Active        bool    `json:"active"`
}

type ArgoCDIntegration struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	BaseURL         string `json:"baseUrl"`
	Active          bool   `json:"active"`
	TokenConfigured bool   `json:"tokenConfigured"`
}

type NexusIntegration struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	URL    string `json:"url"`
	Active bool   `json:"active"`
}

type IPAMAddressStatus string

const (
	IPAMAddressUsed     IPAMAddressStatus = "used"
	IPAMAddressOffline  IPAMAddressStatus = "offline"
	IPAMAddressFree     IPAMAddressStatus = "free"
	IPAMAddressReserved IPAMAddressStatus = "reserved"
)

type IPAMLocation struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	CreatedAt   string  `json:"createdAt,omitempty"`
	UpdatedAt   string  `json:"updatedAt,omitempty"`
}

type IPAMNetwork struct {
	ID          string  `json:"id"`
	LocationID  string  `json:"locationId"`
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	CreatedAt   string  `json:"createdAt,omitempty"`
	UpdatedAt   string  `json:"updatedAt,omitempty"`
}

type IPAMSubnet struct {
	ID                  string  `json:"id"`
	NetworkID           string  `json:"networkId"`
	LocationID          string  `json:"locationId,omitempty"`
	Name                string  `json:"name"`
	CIDR                string  `json:"cidr"`
	Description         *string `json:"description,omitempty"`
	AutoDiscovery       bool    `json:"autoDiscovery"`
	ScanIntervalSeconds int     `json:"scanIntervalSeconds"`
	LastScanStartedAt   *string `json:"lastScanStartedAt,omitempty"`
	LastScanCompletedAt *string `json:"lastScanCompletedAt,omitempty"`
	LastScanStatus      *string `json:"lastScanStatus,omitempty"`
	LastScanError       *string `json:"lastScanError,omitempty"`
	CreatedAt           string  `json:"createdAt,omitempty"`
	UpdatedAt           string  `json:"updatedAt,omitempty"`
}

type IPAMAddress struct {
	ID                  string            `json:"id"`
	SubnetID            string            `json:"subnetId"`
	Address             string            `json:"address"`
	Status              IPAMAddressStatus `json:"status"`
	Hostname            *string           `json:"hostname,omitempty"`
	Description         *string           `json:"description,omitempty"`
	IsOverride          bool              `json:"isOverride"`
	LastScannedAt       *string           `json:"lastScannedAt,omitempty"`
	LastSeenAt          *string           `json:"lastSeenAt,omitempty"`
	ConsecutiveFailures int               `json:"consecutiveFailures"`
	CreatedAt           string            `json:"createdAt,omitempty"`
	UpdatedAt           string            `json:"updatedAt,omitempty"`
}

type IPAMSearchMatchType string

const (
	IPAMSearchMatchIP       IPAMSearchMatchType = "ip"
	IPAMSearchMatchHostname IPAMSearchMatchType = "hostname"
)

type IPAMSearchResource struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type IPAMSearchResult struct {
	ID           string              `json:"id"`
	MatchType    IPAMSearchMatchType `json:"matchType"`
	QueryAddress *string             `json:"queryAddress,omitempty"`
	Address      *IPAMAddress        `json:"address"`
	Subnet       IPAMSubnet          `json:"subnet"`
	Network      IPAMSearchResource  `json:"network"`
	Location     IPAMSearchResource  `json:"location"`
}

type IPAMScanAddress struct {
	ID                  string
	SubnetID            string
	Address             string
	Status              IPAMAddressStatus
	LastSeenAt          *time.Time
	ConsecutiveFailures int
}

type IPAMScanResult struct {
	AddressID           string
	Status              IPAMAddressStatus
	LastScannedAt       time.Time
	LastSeenAt          *time.Time
	ConsecutiveFailures int
}

type IPAMScanSummary struct {
	SubnetID    string     `json:"subnetId"`
	Total       int        `json:"total"`
	Used        int        `json:"used"`
	Offline     int        `json:"offline"`
	Free        int        `json:"free"`
	StartedAt   string     `json:"startedAt"`
	CompletedAt string     `json:"completedAt"`
	Subnet      IPAMSubnet `json:"subnet"`
}

type IPAMScanHistoryStatus string

const (
	IPAMScanHistoryCompleted IPAMScanHistoryStatus = "completed"
	IPAMScanHistoryFailed    IPAMScanHistoryStatus = "failed"
)

type IPAMScanHistory struct {
	ID          string                `json:"id"`
	SubnetID    string                `json:"subnetId"`
	SubnetName  string                `json:"subnetName"`
	SubnetCIDR  string                `json:"subnetCidr"`
	StartedAt   *string               `json:"startedAt,omitempty"`
	CompletedAt string                `json:"completedAt"`
	Status      IPAMScanHistoryStatus `json:"status"`
	Total       *int                  `json:"total,omitempty"`
	Used        *int                  `json:"used,omitempty"`
	Offline     *int                  `json:"offline,omitempty"`
	Free        *int                  `json:"free,omitempty"`
	Reserved    *int                  `json:"reserved,omitempty"`
	Error       *string               `json:"error,omitempty"`
}

type IPAMScanHistoryChange struct {
	ID                          string            `json:"id"`
	HistoryID                   string            `json:"historyId"`
	Address                     string            `json:"address"`
	PreviousStatus              IPAMAddressStatus `json:"previousStatus"`
	CurrentStatus               IPAMAddressStatus `json:"currentStatus"`
	PreviousLastSeenAt          *string           `json:"previousLastSeenAt,omitempty"`
	CurrentLastSeenAt           *string           `json:"currentLastSeenAt,omitempty"`
	PreviousConsecutiveFailures int               `json:"previousConsecutiveFailures"`
	CurrentConsecutiveFailures  int               `json:"currentConsecutiveFailures"`
}

type IPAMScanHistoryDetail struct {
	History IPAMScanHistory         `json:"history"`
	Changes []IPAMScanHistoryChange `json:"changes"`
}

type IPAMAddressSummary struct {
	Total    int `json:"total"`
	Used     int `json:"used"`
	Offline  int `json:"offline"`
	Free     int `json:"free"`
	Reserved int `json:"reserved"`
}

type IPAMSummary struct {
	Locations int                `json:"locations"`
	Networks  int                `json:"networks"`
	Subnets   int                `json:"subnets"`
	Addresses IPAMAddressSummary `json:"addresses"`
}
