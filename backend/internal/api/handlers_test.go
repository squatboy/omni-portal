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
