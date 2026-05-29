package collector

import (
	"context"
	"log"
	"omni-backend/internal/models"
	"sync"
	"time"
)

type SettingsStore interface {
	CollectSettings(ctx context.Context) (models.CollectSettings, error)
}

type Runner struct {
	cache *Cache
	store SettingsStore
}

func NewRunner(cache *Cache, store SettingsStore) *Runner {
	return &Runner{
		cache: cache,
		store: store,
	}
}

func (r *Runner) Start(ctx context.Context) {
	go r.runLoop(ctx, "vms", 30*time.Second, func(ctx context.Context) {
		settings, err := r.settings(ctx)
		if err != nil {
			return
		}
		r.cache.SetVMs(CollectVMs(ctx, settings.VMs))
	})
	go r.runLoop(ctx, "nexus", 30*time.Second, func(ctx context.Context) {
		settings, err := r.settings(ctx)
		if err != nil {
			return
		}
		r.cache.SetNexus(CollectNexus(ctx, settings.Nexus))
	})
	go r.runLoop(ctx, "argocd", 30*time.Second, func(ctx context.Context) {
		settings, err := r.settings(ctx)
		if err != nil {
			return
		}
		r.cache.SetArgoCD(CollectArgoCD(ctx, settings.ArgoCD))
	})
	go r.runLoop(ctx, "gitlab", 30*time.Second, func(ctx context.Context) {
		settings, err := r.settings(ctx)
		if err != nil {
			return
		}
		r.cache.SetGitLab(CollectGitLab(ctx, settings.GitLab))
	})
	go r.runLoop(ctx, "github", 30*time.Second, func(ctx context.Context) {
		settings, err := r.settings(ctx)
		if err != nil {
			return
		}
		r.cache.SetGitHub(CollectGitHub(ctx, settings.GitHub))
	})
	go r.runLoop(ctx, "kubernetes", 30*time.Second, func(ctx context.Context) {
		settings, err := r.settings(ctx)
		if err != nil {
			return
		}
		r.cache.SetKubernetes(CollectKubernetes(ctx, settings.Kubernetes))
	})
}

func (r *Runner) CollectOnce(ctx context.Context) {
	settings, err := r.settings(ctx)
	if err != nil {
		return
	}
	var wg sync.WaitGroup
	wg.Add(6)

	go func() {
		defer wg.Done()
		r.cache.SetVMs(CollectVMs(ctx, settings.VMs))
	}()
	go func() {
		defer wg.Done()
		r.cache.SetNexus(CollectNexus(ctx, settings.Nexus))
	}()
	go func() {
		defer wg.Done()
		r.cache.SetArgoCD(CollectArgoCD(ctx, settings.ArgoCD))
	}()
	go func() {
		defer wg.Done()
		r.cache.SetGitLab(CollectGitLab(ctx, settings.GitLab))
	}()
	go func() {
		defer wg.Done()
		r.cache.SetGitHub(CollectGitHub(ctx, settings.GitHub))
	}()
	go func() {
		defer wg.Done()
		r.cache.SetKubernetes(CollectKubernetes(ctx, settings.Kubernetes))
	}()

	wg.Wait()
}

func (r *Runner) settings(ctx context.Context) (models.CollectSettings, error) {
	settings, err := r.store.CollectSettings(ctx)
	if err != nil {
		log.Printf("collect settings load failed: %v", err)
		return models.CollectSettings{}, err
	}
	return settings, nil
}

func (r *Runner) runLoop(ctx context.Context, name string, interval time.Duration, collectFn func(context.Context)) {
	// Initial collection
	collectFn(ctx)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			collectFn(ctx)
		}
	}
}
