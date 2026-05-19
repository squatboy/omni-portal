package collector

import (
	"context"
	"encoding/json"
	"net/http"
	"omni-backend/internal/config"
	"omni-backend/internal/models"
	"os"
	"strings"
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

func CollectArgoCD(ctx context.Context, cfg *config.AppConfig) models.CollectEnvelope[models.ArgoCdData] {
	baseUrl := strings.TrimRight(cfg.Inventory.ArgoCD.BaseUrl, "/")
	now := time.Now().Format(time.RFC3339)

	if baseUrl == "" {
		return argoError(now, models.ErrUnknownError, "Argo CD base URL not configured", models.StatusUnknown)
	}

	token := strings.TrimSpace(os.Getenv("ARGOCD_TOKEN"))
	if token == "" {
		return argoError(now, models.ErrPermissionDenied, "ARGOCD_TOKEN is missing", models.StatusPermissionError)
	}

	reqCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, "GET", baseUrl+"/api/v1/applications", nil)
	if err != nil {
		return argoError(now, models.ErrConnectionFailed, err.Error(), models.StatusDown)
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

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
		return argoError(now, code, "Argo CD API responded with error", status)
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
			Name:         name,
			Namespace:    namespace,
			SyncStatus:   syncStatus,
			HealthStatus: healthStatus,
			Revision:     revPtr,
			Link:         baseUrl + "/applications/" + name,
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

func argoError(now string, code models.CollectErrorCode, msg string, status models.SourceStatus) models.CollectEnvelope[models.ArgoCdData] {
	return models.CollectEnvelope[models.ArgoCdData]{
		Source:      models.SourceArgoCD,
		Status:      status,
		AttemptedAt: now,
		Stale:       false,
		Error:       &models.CollectError{Code: code, Message: msg},
		Data:        models.ArgoCdData{Applications: []models.ArgoCdApplication{}},
	}
}
