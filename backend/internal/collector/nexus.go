package collector

import (
	"context"
	"net/http"
	"omni-backend/internal/models"
	"strings"
	"sync"
	"time"
)

func CollectNexus(ctx context.Context, targets []models.NexusCollectTarget) models.CollectEnvelope[models.NexusData] {
	now := time.Now().Format(time.RFC3339)

	if len(targets) == 0 {
		collectedAt := now
		return models.CollectEnvelope[models.NexusData]{
			Source:      models.SourceNexus,
			Status:      models.StatusOk,
			AttemptedAt: now,
			CollectedAt: &collectedAt,
			Stale:       false,
			Data:        models.NexusData{Items: []models.NexusStatus{}, CheckedAt: now},
		}
	}

	results := make([]models.NexusStatus, len(targets))
	var wg sync.WaitGroup
	var downCount int
	var timeoutCount int
	var mu sync.Mutex

	for i, target := range targets {
		wg.Add(1)
		go func(i int, target models.NexusCollectTarget) {
			defer wg.Done()
			status, code := collectNexusTarget(ctx, target, now)
			mu.Lock()
			results[i] = status
			if !status.Reachable {
				downCount++
			}
			if code == models.ErrTimeout {
				timeoutCount++
			}
			mu.Unlock()
		}(i, target)
	}
	wg.Wait()

	status := models.StatusOk
	var collectErr *models.CollectError
	if downCount > 0 {
		status = models.StatusDown
		collectErr = &models.CollectError{Code: models.ErrConnectionFailed, Message: "One or more Nexus checks failed"}
	}
	if timeoutCount > 0 {
		status = models.StatusTimeout
		collectErr = &models.CollectError{Code: models.ErrTimeout, Message: "One or more Nexus checks timed out"}
	}

	collectedAt := now
	first := results[0]
	return models.CollectEnvelope[models.NexusData]{
		Source:      models.SourceNexus,
		Status:      status,
		AttemptedAt: now,
		CollectedAt: &collectedAt,
		Stale:       false,
		Error:       collectErr,
		Data: models.NexusData{
			Items:      results,
			Url:        first.Url,
			Reachable:  first.Reachable,
			HttpStatus: first.HttpStatus,
			CheckedAt:  now,
		},
	}
}

func collectNexusTarget(ctx context.Context, target models.NexusCollectTarget, now string) (models.NexusStatus, models.CollectErrorCode) {
	nexusUrl := target.URL
	checkUrl := strings.TrimRight(nexusUrl, "/") + "/service/rest/v1/status"

	reqCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, "HEAD", checkUrl, nil)
	if err != nil {
		return nexusStatus(target, false, nil, now), models.ErrConnectionFailed
	}

	client := &http.Client{}
	resp, err := client.Do(req)

	if err != nil {
		code := models.ErrConnectionFailed
		if reqCtx.Err() == context.DeadlineExceeded {
			code = models.ErrTimeout
		}
		return nexusStatus(target, false, nil, now), code
	}
	defer resp.Body.Close()

	reachable := resp.StatusCode >= 200 && resp.StatusCode < 300
	code := models.CollectErrorCode("")
	if !reachable {
		code = models.ErrConnectionFailed
	}

	return nexusStatus(target, reachable, &resp.StatusCode, now), code
}

func nexusStatus(target models.NexusCollectTarget, reachable bool, httpStatus *int, checkedAt string) models.NexusStatus {
	return models.NexusStatus{
		ID:              target.ID,
		IntegrationName: target.Name,
		Url:             target.URL,
		Reachable:       reachable,
		HttpStatus:      httpStatus,
		CheckedAt:       checkedAt,
	}
}
