package collector

import (
	"context"
	"omni-backend/internal/config"
	"omni-backend/internal/models"
	"os/exec"
	"runtime"
	"sync"
	"time"
)

func CollectVMs(ctx context.Context, cfg *config.AppConfig) models.CollectEnvelope[models.VmsData] {
	vms := cfg.Inventory.Vms
	now := time.Now().Format(time.RFC3339)

	if len(vms) == 0 {
		collectedAt := now
		return models.CollectEnvelope[models.VmsData]{
			Source:      models.SourceVMs,
			Status:      models.StatusOk,
			AttemptedAt: now,
			CollectedAt: &collectedAt,
			Stale:       false,
			Error:       nil,
			Data:        models.VmsData{Items: []models.VmStatus{}},
		}
	}

	results := make([]models.VmStatus, len(vms))
	var wg sync.WaitGroup
	var upCount int
	var mu sync.Mutex

	for i, vm := range vms {
		wg.Add(1)
		go func(i int, v models.VmInventoryItem) {
			defer wg.Done()
			state := pingVm(ctx, v.Address)
			mu.Lock()
			if state == models.VmPingUp {
				upCount++
			}
			results[i] = models.VmStatus{
				VmInventoryItem: v,
				State:           state,
				LastCheckedAt:   time.Now().Format(time.RFC3339),
			}
			mu.Unlock()
		}(i, vm)
	}

	wg.Wait()

	status := models.StatusOk
	if upCount == 0 {
		status = models.StatusDown
	} else if upCount < len(vms) {
		status = models.StatusStale
	}

	collectedAt := now
	return models.CollectEnvelope[models.VmsData]{
		Source:      models.SourceVMs,
		Status:      status,
		AttemptedAt: now,
		CollectedAt: &collectedAt,
		Stale:       false,
		Error:       nil,
		Data:        models.VmsData{Items: results},
	}
}

func pingVm(ctx context.Context, address string) models.VmPingState {
	reqCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(reqCtx, "ping", "-n", "1", "-w", "1000", address)
	} else if runtime.GOOS == "darwin" {
		cmd = exec.CommandContext(reqCtx, "ping", "-c", "1", "-t", "1", address)
	} else {
		cmd = exec.CommandContext(reqCtx, "ping", "-c", "1", "-W", "1", address)
	}

	err := cmd.Run()
	if err != nil {
		if reqCtx.Err() == context.DeadlineExceeded {
			return models.VmPingUnknown
		}
		return models.VmPingDown
	}

	return models.VmPingUp
}
