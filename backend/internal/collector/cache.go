package collector

import (
	"omni-backend/internal/models"
	"sync"
	"time"
)

type Cache struct {
	mu         sync.RWMutex
	vms        models.CollectEnvelope[models.VmsData]
	kubernetes models.CollectEnvelope[models.KubernetesData]
	argocd     models.CollectEnvelope[models.ArgoCdData]
	gitlab     models.CollectEnvelope[models.GitLabData]
	nexus      models.CollectEnvelope[models.NexusData]
	overview   models.CollectEnvelope[models.OverviewData]
}

func NewCache() *Cache {
	return &Cache{
		vms:        models.CollectEnvelope[models.VmsData]{Source: models.SourceVMs, Status: models.StatusUnknown},
		kubernetes: models.CollectEnvelope[models.KubernetesData]{Source: models.SourceKubernetes, Status: models.StatusUnknown},
		argocd:     models.CollectEnvelope[models.ArgoCdData]{Source: models.SourceArgoCD, Status: models.StatusUnknown},
		gitlab:     models.CollectEnvelope[models.GitLabData]{Source: models.SourceGitLab, Status: models.StatusUnknown},
		nexus:      models.CollectEnvelope[models.NexusData]{Source: models.SourceNexus, Status: models.StatusUnknown},
		overview:   models.CollectEnvelope[models.OverviewData]{Source: models.SourceOverview, Status: models.StatusUnknown},
	}
}

func (c *Cache) GetVMs() models.CollectEnvelope[models.VmsData] {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.vms
}

func (c *Cache) SetVMs(data models.CollectEnvelope[models.VmsData]) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.vms = data
	c.updateOverview()
}

func (c *Cache) GetKubernetes() models.CollectEnvelope[models.KubernetesData] {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.kubernetes
}

func (c *Cache) SetKubernetes(data models.CollectEnvelope[models.KubernetesData]) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.kubernetes = data
	c.updateOverview()
}

func (c *Cache) GetArgoCD() models.CollectEnvelope[models.ArgoCdData] {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.argocd
}

func (c *Cache) SetArgoCD(data models.CollectEnvelope[models.ArgoCdData]) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.argocd = data
	c.updateOverview()
}

func (c *Cache) GetGitLab() models.CollectEnvelope[models.GitLabData] {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.gitlab
}

func (c *Cache) SetGitLab(data models.CollectEnvelope[models.GitLabData]) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.gitlab = data
	c.updateOverview()
}

func (c *Cache) GetNexus() models.CollectEnvelope[models.NexusData] {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.nexus
}

func (c *Cache) SetNexus(data models.CollectEnvelope[models.NexusData]) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.nexus = data
	c.updateOverview()
}

func (c *Cache) GetOverview() models.CollectEnvelope[models.OverviewData] {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.overview
}

// updateOverview calculates the overview health and data. Assumes c.mu is already locked.
func (c *Cache) updateOverview() {
	now := time.Now().Format(time.RFC3339)
	sources := []models.SourceSummary{
		{Source: c.vms.Source, Status: c.vms.Status, AttemptedAt: c.vms.AttemptedAt, CollectedAt: c.vms.CollectedAt, Stale: c.vms.Stale, Error: c.vms.Error},
		{Source: c.kubernetes.Source, Status: c.kubernetes.Status, AttemptedAt: c.kubernetes.AttemptedAt, CollectedAt: c.kubernetes.CollectedAt, Stale: c.kubernetes.Stale, Error: c.kubernetes.Error},
		{Source: c.argocd.Source, Status: c.argocd.Status, AttemptedAt: c.argocd.AttemptedAt, CollectedAt: c.argocd.CollectedAt, Stale: c.argocd.Stale, Error: c.argocd.Error},
		{Source: c.gitlab.Source, Status: c.gitlab.Status, AttemptedAt: c.gitlab.AttemptedAt, CollectedAt: c.gitlab.CollectedAt, Stale: c.gitlab.Stale, Error: c.gitlab.Error},
		{Source: c.nexus.Source, Status: c.nexus.Status, AttemptedAt: c.nexus.AttemptedAt, CollectedAt: c.nexus.CollectedAt, Stale: c.nexus.Stale, Error: c.nexus.Error},
	}

	overallHealth := models.HealthOk
	hasUnknown := false
	for _, s := range sources {
		if s.Status == models.StatusDown || s.Status == models.StatusTimeout || s.Status == models.StatusPermissionError || s.Error != nil {
			overallHealth = models.HealthDegraded
			break
		}
		if s.Status == models.StatusUnknown {
			hasUnknown = true
		}
	}
	if overallHealth == models.HealthOk && hasUnknown {
		overallHealth = models.HealthUnknown
	}

	collectedAt := now
	c.overview = models.CollectEnvelope[models.OverviewData]{
		Source:      models.SourceOverview,
		Status:      models.StatusOk,
		AttemptedAt: now,
		CollectedAt: &collectedAt,
		Stale:       false,
		Data: models.OverviewData{
			Health:      overallHealth,
			GeneratedAt: now,
			Sources:     sources,
		},
	}
}
