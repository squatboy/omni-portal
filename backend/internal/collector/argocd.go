package collector

import (
	"context"
	"encoding/json"
	"net/http"
	"omni-backend/internal/models"
	"strings"
	"sync"
	"time"
)

type argoApplicationListResponse struct {
	Items []argoApplicationItem `json:"items"`
}

type argoApplicationItem struct {
	Metadata struct {
		Name      string `json:"name"`
		Namespace string `json:"namespace"`
	} `json:"metadata"`
	Status struct {
		Sync struct {
			Status   string `json:"status"`
			Revision string `json:"revision"`
		} `json:"sync"`
		Health struct {
			Status string `json:"status"`
		} `json:"health"`
	} `json:"status"`
}

func CollectArgoCD(ctx context.Context, targets []models.ArgoCDCollectTarget) models.CollectEnvelope[models.ArgoCdData] {
	now := time.Now().Format(time.RFC3339)

	if len(targets) == 0 {
		collectedAt := now
		return models.CollectEnvelope[models.ArgoCdData]{
			Source:      models.SourceArgoCD,
			Status:      models.StatusUnknown,
			AttemptedAt: now,
			CollectedAt: &collectedAt,
			Stale:       false,
			Data:        models.ArgoCdData{Applications: []models.ArgoCdApplication{}},
		}
	}
	var wg sync.WaitGroup
	var mu sync.Mutex
	applications := []models.ArgoCdApplication{}
	status := models.StatusOk
	var collectErr *models.CollectError

	for _, target := range targets {
		wg.Add(1)
		go func(target models.ArgoCDCollectTarget) {
			defer wg.Done()
			result := collectArgoCDTarget(ctx, target, now)
			mu.Lock()
			applications = append(applications, result.Data.Applications...)
			if severity(result.Status) > severity(status) {
				status = result.Status
				collectErr = result.Error
			}
			mu.Unlock()
		}(target)
	}
	wg.Wait()

	collectedAt := now
	return models.CollectEnvelope[models.ArgoCdData]{
		Source:      models.SourceArgoCD,
		Status:      status,
		AttemptedAt: now,
		CollectedAt: &collectedAt,
		Stale:       status == models.StatusStale,
		Error:       collectErr,
		Data:        models.ArgoCdData{Applications: applications},
	}
}

func collectArgoCDTarget(ctx context.Context, target models.ArgoCDCollectTarget, now string) models.CollectEnvelope[models.ArgoCdData] {
	baseUrl := strings.TrimRight(target.BaseURL, "/")

	reqCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, "GET", baseUrl+"/api/v1/applications", nil)
	if err != nil {
		return argoError(now, models.ErrConnectionFailed, err.Error(), models.StatusDown)
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+target.Token)

	client := &http.Client{}
	resp, err := client.Do(req)

	if err != nil {
		code := models.ErrConnectionFailed
		status := models.StatusDown
		if reqCtx.Err() == context.DeadlineExceeded {
			code = models.ErrTimeout
			status = models.StatusTimeout
		}
		return argoError(now, code, err.Error(), status)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		code := models.ErrConnectionFailed
		status := models.StatusDown
		if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
			code = models.ErrPermissionDenied
			status = models.StatusPermissionError
		}
		upstreamStatus := resp.StatusCode
		return argoError(now, code, "Argo CD API responded with error", status, &upstreamStatus)
	}

	var payload argoApplicationListResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return argoError(now, models.ErrUnknownError, "Failed to parse ArgoCD response", models.StatusDown)
	}

	var applications []models.ArgoCdApplication
	isStale := false
	isProgressing := false

	for _, item := range payload.Items {
		name := item.Metadata.Name
		namespace := item.Metadata.Namespace
		if name == "" || namespace == "" {
			continue
		}

		syncStatus := item.Status.Sync.Status
		if syncStatus != "Synced" && syncStatus != "OutOfSync" {
			syncStatus = "Unknown"
		}

		healthStatus := item.Status.Health.Status
		if healthStatus != "Healthy" && healthStatus != "Progressing" && healthStatus != "Degraded" {
			healthStatus = "Unknown"
		}

		rev := item.Status.Sync.Revision
		var revPtr *string
		if rev != "" {
			revPtr = &rev
		}

		applications = append(applications, models.ArgoCdApplication{
			IntegrationName: target.Name,
			Name:            name,
			Namespace:       namespace,
			SyncStatus:      syncStatus,
			HealthStatus:    healthStatus,
			Revision:        revPtr,
			Link:            baseUrl + "/applications/" + name,
		})

		if healthStatus == "Degraded" || healthStatus == "Unknown" || (syncStatus != "Synced" && healthStatus != "Progressing") {
			isStale = true
		}
		if healthStatus == "Progressing" {
			isProgressing = true
		}
	}

	status := models.StatusOk
	if isStale {
		status = models.StatusStale
	} else if isProgressing {
		status = models.StatusProgressing
	}

	collectedAt := now
	return models.CollectEnvelope[models.ArgoCdData]{
		Source:      models.SourceArgoCD,
		Status:      status,
		AttemptedAt: now,
		CollectedAt: &collectedAt,
		Stale:       false,
		Error:       nil,
		Data:        models.ArgoCdData{Applications: applications},
	}
}

func severity(status models.SourceStatus) int {
	switch status {
	case models.StatusDown, models.StatusTimeout, models.StatusPermissionError:
		return 4
	case models.StatusStale:
		return 3
	case models.StatusProgressing:
		return 2
	case models.StatusUnknown:
		return 1
	default:
		return 0
	}
}

func argoError(now string, code models.CollectErrorCode, msg string, status models.SourceStatus, upstreamStatus ...*int) models.CollectEnvelope[models.ArgoCdData] {
	var upstream *int
	if len(upstreamStatus) > 0 {
		upstream = upstreamStatus[0]
	}
	return models.CollectEnvelope[models.ArgoCdData]{
		Source:      models.SourceArgoCD,
		Status:      status,
		AttemptedAt: now,
		Stale:       false,
		Error:       &models.CollectError{Code: code, Message: msg, UpstreamStatus: upstream},
		Data:        models.ArgoCdData{Applications: []models.ArgoCdApplication{}},
	}
}
