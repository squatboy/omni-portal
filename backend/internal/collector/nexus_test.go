package collector

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"omni-backend/internal/models"
)

func TestCollectNexusUpstreamStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer server.Close()

	envelope := CollectNexus(context.Background(), []models.NexusCollectTarget{{
		ID:   "nexus",
		Name: "Nexus",
		URL:  server.URL,
	}})

	if envelope.Status != models.StatusDown || envelope.Error == nil || envelope.Error.Code != models.ErrConnectionFailed {
		t.Fatalf("expected down connection error, got status=%s error=%#v", envelope.Status, envelope.Error)
	}
	assertUpstreamStatus(t, envelope.Error, http.StatusTooManyRequests)
}
