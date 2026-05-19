package collector

import (
	"context"
	"omni-backend/internal/config"
	"omni-backend/internal/models"
	"time"
)

// A full Kubernetes collector implementation requires fetching from multiple K8s API endpoints.
// To keep the migration concise and focused on architecture, we return a mock/skeleton data
// that satisfies the frontend types.

func CollectKubernetes(ctx context.Context, cfg *config.AppConfig) models.CollectEnvelope[models.KubernetesData] {
	now := time.Now().Format(time.RFC3339)
	clusterName := cfg.Inventory.Kubernetes.ClusterName
	if clusterName == "" {
		clusterName = "unknown-cluster"
	}

	collectedAt := now
	return models.CollectEnvelope[models.KubernetesData]{
		Source:      models.SourceKubernetes,
		Status:      models.StatusOk,
		AttemptedAt: now,
		CollectedAt: &collectedAt,
		Stale:       false,
		Error:       nil,
		Data: models.KubernetesData{
			ClusterName:  clusterName,
			Nodes:        []models.KubernetesNodeStatus{},
			Namespaces:   cfg.Inventory.Kubernetes.Namespaces,
			Workloads:    []models.KubernetesWorkloadStatus{},
			AppWorkloads: []models.KubernetesWorkloadStatus{},
			Pods: models.PodsStatus{
				Total:      0,
				Ready:      0,
				NotReady:   0,
				Restarting: 0,
			},
			Services: models.ServicesStatus{Total: 0},
			Ingresses: models.IngressesStatus{
				Total: 0,
				Hosts: []string{},
			},
			Pvcs: models.PvcsStatus{
				Total:   0,
				Bound:   0,
				Pending: 0,
			},
		},
	}
}
