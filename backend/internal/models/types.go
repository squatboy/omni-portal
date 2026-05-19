package models

type CollectSource string

const (
	SourceOverview   CollectSource = "overview"
	SourceVMs        CollectSource = "vms"
	SourceKubernetes CollectSource = "kubernetes"
	SourceArgoCD     CollectSource = "argocd"
	SourceGitLab     CollectSource = "gitlab"
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
	Code    CollectErrorCode `json:"code"`
	Message string           `json:"message"`
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
	Link        *string `json:"link,omitempty"`
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
	Name               string   `json:"name"`
	Ready              bool     `json:"ready"`
	CpuUsagePercent    *float64 `json:"cpuUsagePercent"`
	MemoryUsagePercent *float64 `json:"memoryUsagePercent"`
}

type KubernetesWorkloadStatus struct {
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
	ClusterName  string                     `json:"clusterName"`
	Nodes        []KubernetesNodeStatus     `json:"nodes"`
	Namespaces   []string                   `json:"namespaces"`
	Workloads    []KubernetesWorkloadStatus `json:"workloads"`
	AppWorkloads []KubernetesWorkloadStatus `json:"appWorkloads"`
	Pods         PodsStatus                 `json:"pods"`
	Services     ServicesStatus             `json:"services"`
	Ingresses    IngressesStatus            `json:"ingresses"`
	Pvcs         PvcsStatus                 `json:"pvcs"`
}

type ArgoCdApplication struct {
	Name         string  `json:"name"`
	Namespace    string  `json:"namespace"`
	SyncStatus   string  `json:"syncStatus"`   // Synced, OutOfSync, Unknown
	HealthStatus string  `json:"healthStatus"` // Healthy, Progressing, Degraded, Unknown
	Revision     *string `json:"revision"`
	Link         string  `json:"link"`
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
	LatestCommit   *GitLabCommit   `json:"latestCommit"`
	LatestPipeline *GitLabPipeline `json:"latestPipeline"`
}

type GitLabData struct {
	Projects []GitLabProjectStatus `json:"projects"`
}

type NexusData struct {
	Url        string `json:"url"`
	Reachable  bool   `json:"reachable"`
	HttpStatus *int   `json:"httpStatus"`
	CheckedAt  string `json:"checkedAt"`
}

type KubernetesInventoryConfig struct {
	ClusterName   string   `json:"clusterName"`
	Namespaces    []string `json:"namespaces"`
	AppNamespaces []string `json:"appNamespaces"`
}

type CollectInventoryConfig struct {
	Vms        []VmInventoryItem         `json:"vms"`
	Kubernetes KubernetesInventoryConfig `json:"kubernetes"`
	ArgoCD     struct {
		BaseUrl string `json:"baseUrl"`
	} `json:"argocd"`
	GitLab struct {
		BaseUrl  string                `json:"baseUrl"`
		Projects []GitLabProjectTarget `json:"projects"`
	} `json:"gitlab"`
	Nexus struct {
		Url string `json:"url"`
	} `json:"nexus"`
}
