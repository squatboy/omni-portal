package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"omni-backend/internal/collector"
	"omni-backend/internal/models"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestCollectSnapshotRoute(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ginRouter := SetupRouter(collector.NewCache(), nil, nil, nil)

	req := httptest.NewRequest(http.MethodGet, "/api/collect/snapshot", nil)
	rec := httptest.NewRecorder()

	ginRouter.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rec.Code)
	}

	var snapshot map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &snapshot); err != nil {
		t.Fatalf("expected JSON snapshot response: %v", err)
	}
	for _, key := range []string{"overview", "vms", "kubernetes", "argocd", "gitlab", "nexus"} {
		if _, ok := snapshot[key]; !ok {
			t.Fatalf("expected snapshot key %q", key)
		}
	}
}

func TestCollectSnapshotRouteHTTPStatus(t *testing.T) {
	tests := []struct {
		name  string
		cache *collector.Cache
		want  int
	}{
		{name: "all unknown initial state", cache: collector.NewCache(), want: http.StatusOK},
		{name: "all runtime sources healthy", cache: collectCacheWithStatuses(t, map[models.CollectSource]models.SourceStatus{}), want: http.StatusOK},
		{name: "partial runtime source failure", cache: collectCacheWithStatuses(t, map[models.CollectSource]models.SourceStatus{models.SourceNexus: models.StatusDown}), want: http.StatusMultiStatus},
		{name: "all runtime sources failed", cache: collectCacheWithStatuses(t, map[models.CollectSource]models.SourceStatus{
			models.SourceVMs:        models.StatusDown,
			models.SourceKubernetes: models.StatusDown,
			models.SourceArgoCD:     models.StatusTimeout,
			models.SourceGitLab:     models.StatusPermissionError,
			models.SourceNexus:      models.StatusDown,
		}), want: http.StatusBadGateway},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gin.SetMode(gin.TestMode)
			ginRouter := SetupRouter(tt.cache, nil, nil, nil)

			req := httptest.NewRequest(http.MethodGet, "/api/collect/snapshot", nil)
			rec := httptest.NewRecorder()

			ginRouter.ServeHTTP(rec, req)

			if rec.Code != tt.want {
				t.Fatalf("expected status %d, got %d", tt.want, rec.Code)
			}
		})
	}
}

func TestCollectSourceRouteHTTPStatus(t *testing.T) {
	cache := collector.NewCache()
	cache.SetNexus(models.CollectEnvelope[models.NexusData]{
		Source: models.SourceNexus,
		Status: models.StatusDown,
		Error:  &models.CollectError{Code: models.ErrConnectionFailed, Message: "connection refused"},
	})
	gin.SetMode(gin.TestMode)
	ginRouter := SetupRouter(cache, nil, nil, nil)

	req := httptest.NewRequest(http.MethodGet, "/api/collect/nexus", nil)
	rec := httptest.NewRecorder()

	ginRouter.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadGateway {
		t.Fatalf("expected status %d, got %d", http.StatusBadGateway, rec.Code)
	}
}

func TestTestResultHTTPStatus(t *testing.T) {
	upstream400 := http.StatusBadRequest
	upstream404 := http.StatusNotFound
	upstream422 := http.StatusUnprocessableEntity
	upstream429 := http.StatusTooManyRequests
	upstream500 := http.StatusInternalServerError

	tests := []struct {
		name       string
		status     models.SourceStatus
		collectErr *models.CollectError
		want       int
	}{
		{name: "ok", status: models.StatusOk, want: http.StatusOK},
		{name: "unknown without error", status: models.StatusUnknown, want: http.StatusOK},
		{name: "stale", status: models.StatusStale, want: http.StatusOK},
		{name: "permission status", status: models.StatusPermissionError, collectErr: &models.CollectError{Code: models.ErrPermissionDenied}, want: http.StatusForbidden},
		{name: "upstream 400", status: models.StatusDown, collectErr: &models.CollectError{Code: models.ErrConnectionFailed, UpstreamStatus: &upstream400}, want: http.StatusUnprocessableEntity},
		{name: "upstream 404", status: models.StatusDown, collectErr: &models.CollectError{Code: models.ErrConnectionFailed, UpstreamStatus: &upstream404}, want: http.StatusUnprocessableEntity},
		{name: "upstream 422", status: models.StatusDown, collectErr: &models.CollectError{Code: models.ErrConnectionFailed, UpstreamStatus: &upstream422}, want: http.StatusUnprocessableEntity},
		{name: "upstream 429", status: models.StatusDown, collectErr: &models.CollectError{Code: models.ErrConnectionFailed, UpstreamStatus: &upstream429}, want: http.StatusServiceUnavailable},
		{name: "timeout", status: models.StatusTimeout, collectErr: &models.CollectError{Code: models.ErrTimeout}, want: http.StatusGatewayTimeout},
		{name: "upstream 500", status: models.StatusDown, collectErr: &models.CollectError{Code: models.ErrConnectionFailed, UpstreamStatus: &upstream500}, want: http.StatusBadGateway},
		{name: "connection failed", status: models.StatusDown, collectErr: &models.CollectError{Code: models.ErrConnectionFailed}, want: http.StatusBadGateway},
		{name: "parse failure", status: models.StatusDown, collectErr: &models.CollectError{Code: models.ErrUnknownError}, want: http.StatusBadGateway},
		{name: "unknown fallback", status: models.StatusUnknown, collectErr: &models.CollectError{Code: models.ErrUnknownError}, want: http.StatusInternalServerError},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := testResultHTTPStatus(tt.status, tt.collectErr)
			if got != tt.want {
				t.Fatalf("expected %d, got %d", tt.want, got)
			}
		})
	}
}

func collectCacheWithStatuses(t *testing.T, statuses map[models.CollectSource]models.SourceStatus) *collector.Cache {
	t.Helper()
	cache := collector.NewCache()
	statusFor := func(source models.CollectSource) models.SourceStatus {
		if status, ok := statuses[source]; ok {
			return status
		}
		return models.StatusOk
	}
	errorFor := func(status models.SourceStatus) *models.CollectError {
		switch status {
		case models.StatusDown:
			return &models.CollectError{Code: models.ErrConnectionFailed, Message: "connection failed"}
		case models.StatusTimeout:
			return &models.CollectError{Code: models.ErrTimeout, Message: "timed out"}
		case models.StatusPermissionError:
			return &models.CollectError{Code: models.ErrPermissionDenied, Message: "permission denied"}
		default:
			return nil
		}
	}
	vmStatus := statusFor(models.SourceVMs)
	kubernetesStatus := statusFor(models.SourceKubernetes)
	argoCDStatus := statusFor(models.SourceArgoCD)
	gitLabStatus := statusFor(models.SourceGitLab)
	nexusStatus := statusFor(models.SourceNexus)

	cache.SetVMs(models.CollectEnvelope[models.VmsData]{Source: models.SourceVMs, Status: vmStatus, Error: errorFor(vmStatus)})
	cache.SetKubernetes(models.CollectEnvelope[models.KubernetesData]{Source: models.SourceKubernetes, Status: kubernetesStatus, Error: errorFor(kubernetesStatus)})
	cache.SetArgoCD(models.CollectEnvelope[models.ArgoCdData]{Source: models.SourceArgoCD, Status: argoCDStatus, Error: errorFor(argoCDStatus)})
	cache.SetGitLab(models.CollectEnvelope[models.GitLabData]{Source: models.SourceGitLab, Status: gitLabStatus, Error: errorFor(gitLabStatus)})
	cache.SetNexus(models.CollectEnvelope[models.NexusData]{Source: models.SourceNexus, Status: nexusStatus, Error: errorFor(nexusStatus)})
	return cache
}
