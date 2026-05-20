package collector

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"omni-backend/internal/models"
)

func TestCollectArgoCDUpstreamStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer server.Close()

	envelope := CollectArgoCD(context.Background(), []models.ArgoCDCollectTarget{{
		ID:      "argocd",
		Name:    "Argo CD",
		BaseURL: server.URL,
		Token:   "bad-token",
	}})

	if envelope.Status != models.StatusPermissionError || envelope.Error == nil || envelope.Error.Code != models.ErrPermissionDenied {
		t.Fatalf("expected permission error, got status=%s error=%#v", envelope.Status, envelope.Error)
	}
	assertUpstreamStatus(t, envelope.Error, http.StatusForbidden)
}
