package collector

import (
	"context"
	"net/http"
	"omni-backend/internal/config"
	"omni-backend/internal/models"
	"strings"
	"time"
)

func CollectNexus(ctx context.Context, cfg *config.AppConfig) models.CollectEnvelope[models.NexusData] {
	nexusUrl := cfg.Inventory.Nexus.Url
	now := time.Now().Format(time.RFC3339)

	if nexusUrl == "" {
		return models.CollectEnvelope[models.NexusData]{
			Source:      models.SourceNexus,
			Status:      models.StatusUnknown,
			AttemptedAt: now,
			Stale:       false,
			Error:       &models.CollectError{Code: models.ErrUnknownError, Message: "Nexus URL not configured"},
			Data:        models.NexusData{Url: "", Reachable: false, HttpStatus: nil, CheckedAt: now},
		}
	}

	checkUrl := strings.TrimRight(nexusUrl, "/") + "/service/rest/v1/status"

	reqCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, "HEAD", checkUrl, nil)
	if err != nil {
		return nexusError(now, nexusUrl, models.ErrConnectionFailed, err.Error())
	}

	client := &http.Client{}
	resp, err := client.Do(req)

	if err != nil {
		code := models.ErrConnectionFailed
		if reqCtx.Err() == context.DeadlineExceeded {
			code = models.ErrTimeout
		}
		return nexusError(now, nexusUrl, code, err.Error())
	}
	defer resp.Body.Close()

	reachable := resp.StatusCode >= 200 && resp.StatusCode < 300
	status := models.StatusOk
	var collectErr *models.CollectError

	if !reachable {
		status = models.StatusDown
		collectErr = &models.CollectError{
			Code:    models.ErrConnectionFailed,
			Message: "Nexus health check failed",
		}
	}

	collectedAt := now
	return models.CollectEnvelope[models.NexusData]{
		Source:      models.SourceNexus,
		Status:      status,
		AttemptedAt: now,
		CollectedAt: &collectedAt,
		Stale:       false,
		Error:       collectErr,
		Data: models.NexusData{
			Url:        nexusUrl,
			Reachable:  reachable,
			HttpStatus: &resp.StatusCode,
			CheckedAt:  now,
		},
	}
}

func nexusError(now string, url string, code models.CollectErrorCode, msg string) models.CollectEnvelope[models.NexusData] {
	status := models.StatusDown
	if code == models.ErrTimeout {
		status = models.StatusTimeout
	}
	return models.CollectEnvelope[models.NexusData]{
		Source:      models.SourceNexus,
		Status:      status,
		AttemptedAt: now,
		Stale:       false,
		Error:       &models.CollectError{Code: code, Message: msg},
		Data:        models.NexusData{Url: url, Reachable: false, HttpStatus: nil, CheckedAt: now},
	}
}
