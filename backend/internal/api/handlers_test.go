package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"omni-backend/internal/collector"
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
