package collector

import (
	"context"
	"omni-backend/internal/config"
	"time"
)

type Runner struct {
	cache  *Cache
	config *config.AppConfig
}

func NewRunner(cache *Cache, cfg *config.AppConfig) *Runner {
	return &Runner{
		cache:  cache,
		config: cfg,
	}
}

func (r *Runner) Start(ctx context.Context) {
	go r.runLoop(ctx, "vms", 30*time.Second, func(ctx context.Context) {
		r.cache.SetVMs(CollectVMs(ctx, r.config))
	})
	go r.runLoop(ctx, "nexus", 30*time.Second, func(ctx context.Context) {
		r.cache.SetNexus(CollectNexus(ctx, r.config))
	})
	go r.runLoop(ctx, "argocd", 30*time.Second, func(ctx context.Context) {
		r.cache.SetArgoCD(CollectArgoCD(ctx, r.config))
	})
	go r.runLoop(ctx, "gitlab", 30*time.Second, func(ctx context.Context) {
		r.cache.SetGitLab(CollectGitLab(ctx, r.config))
	})
	go r.runLoop(ctx, "kubernetes", 30*time.Second, func(ctx context.Context) {
		r.cache.SetKubernetes(CollectKubernetes(ctx, r.config))
	})
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
