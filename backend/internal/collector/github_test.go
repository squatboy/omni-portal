package collector

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"omni-backend/internal/models"
)

func TestCollectGitHubFailureMapping(t *testing.T) {
	t.Run("missing token", func(t *testing.T) {
		envelope := CollectGitHub(context.Background(), []models.GitHubCollectTarget{
			githubTestTarget("https://github.example.internal", "", []models.GitHubRepositoryTarget{githubTestRepository("owner/repo")}),
		})

		assertGitHubError(t, envelope, models.StatusPermissionError, models.ErrPermissionDenied)
	})

	t.Run("missing repositories", func(t *testing.T) {
		envelope := CollectGitHub(context.Background(), []models.GitHubCollectTarget{
			githubTestTarget("https://github.example.internal", "test-token", nil),
		})

		assertGitHubError(t, envelope, models.StatusDown, models.ErrConnectionFailed)
	})

	t.Run("invalid token", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("Authorization") != "Bearer valid-token" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			writeGitHubTestPayload(w, r)
		}))
		defer server.Close()

		envelope := CollectGitHub(context.Background(), []models.GitHubCollectTarget{
			githubTestTarget(server.URL, "bad-token", []models.GitHubRepositoryTarget{githubTestRepository("owner/repo")}),
		})

		assertGitHubError(t, envelope, models.StatusPermissionError, models.ErrPermissionDenied)
		assertUpstreamStatus(t, envelope.Error, http.StatusUnauthorized)
	})

	t.Run("invalid repository", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.Contains(r.URL.EscapedPath(), "missing/repo") {
				w.WriteHeader(http.StatusNotFound)
				return
			}
			writeGitHubTestPayload(w, r)
		}))
		defer server.Close()

		envelope := CollectGitHub(context.Background(), []models.GitHubCollectTarget{
			githubTestTarget(server.URL, "test-token", []models.GitHubRepositoryTarget{githubTestRepository("missing/repo")}),
		})

		assertGitHubError(t, envelope, models.StatusDown, models.ErrConnectionFailed)
		assertUpstreamStatus(t, envelope.Error, http.StatusNotFound)
	})

	t.Run("api 500", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
		}))
		defer server.Close()

		envelope := CollectGitHub(context.Background(), []models.GitHubCollectTarget{
			githubTestTarget(server.URL, "test-token", []models.GitHubRepositoryTarget{githubTestRepository("owner/repo")}),
		})

		assertGitHubError(t, envelope, models.StatusDown, models.ErrConnectionFailed)
		assertUpstreamStatus(t, envelope.Error, http.StatusInternalServerError)
	})

	t.Run("bad json", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte("{"))
		}))
		defer server.Close()

		envelope := CollectGitHub(context.Background(), []models.GitHubCollectTarget{
			githubTestTarget(server.URL, "test-token", []models.GitHubRepositoryTarget{githubTestRepository("owner/repo")}),
		})

		assertGitHubError(t, envelope, models.StatusDown, models.ErrUnknownError)
	})

	t.Run("rate limited", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("X-RateLimit-Remaining", "0")
			w.WriteHeader(http.StatusForbidden)
			_ = json.NewEncoder(w).Encode(map[string]string{"message": "API rate limit exceeded"})
		}))
		defer server.Close()

		envelope := CollectGitHub(context.Background(), []models.GitHubCollectTarget{
			githubTestTarget(server.URL, "test-token", []models.GitHubRepositoryTarget{githubTestRepository("owner/repo")}),
		})

		assertGitHubError(t, envelope, models.StatusDown, models.ErrConnectionFailed)
		assertUpstreamStatus(t, envelope.Error, http.StatusForbidden)
	})
}

func TestCollectGitHubWorkflowStatusMapping(t *testing.T) {
	tests := []struct {
		name       string
		status     string
		conclusion *string
		want       models.SourceStatus
	}{
		{name: "empty workflow runs", want: models.StatusOk},
		{name: "failed workflow", status: "completed", conclusion: stringPtr("failure"), want: models.StatusStale},
		{name: "cancelled workflow", status: "completed", conclusion: stringPtr("cancelled"), want: models.StatusStale},
		{name: "queued workflow", status: "queued", want: models.StatusProgressing},
		{name: "in progress workflow", status: "in_progress", want: models.StatusProgressing},
		{name: "successful workflow", status: "completed", conclusion: stringPtr("success"), want: models.StatusOk},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				writeGitHubTestPayloadWithRun(w, r, tt.status, tt.conclusion)
			}))
			defer server.Close()

			envelope := CollectGitHub(context.Background(), []models.GitHubCollectTarget{
				githubTestTarget(server.URL, "test-token", []models.GitHubRepositoryTarget{githubTestRepository("owner/repo")}),
			})

			if envelope.Status != tt.want {
				t.Fatalf("expected status=%s, got status=%s error=%#v", tt.want, envelope.Status, envelope.Error)
			}
		})
	}
}

func TestCollectGitHubDefaultsAndBaseURLMapping(t *testing.T) {
	t.Run("uses name as full name fallback and defaults branch", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(writeGitHubTestPayload))
		defer server.Close()

		envelope := CollectGitHub(context.Background(), []models.GitHubCollectTarget{
			githubTestTarget(server.URL, "test-token", []models.GitHubRepositoryTarget{
				{Name: "owner/repo"},
			}),
		})

		if envelope.Status != models.StatusOk {
			t.Fatalf("expected status=%s, got status=%s error=%#v", models.StatusOk, envelope.Status, envelope.Error)
		}
		if len(envelope.Data.Repositories) != 1 || envelope.Data.Repositories[0].FullName != "owner/repo" {
			t.Fatalf("expected fallback full name owner/repo, got %#v", envelope.Data.Repositories)
		}
		if envelope.Data.Repositories[0].DefaultBranch != "main" {
			t.Fatalf("expected default branch main, got %q", envelope.Data.Repositories[0].DefaultBranch)
		}
	})

	t.Run("maps github dot com to api.github.com", func(t *testing.T) {
		got, err := githubAPIRoot("https://github.com")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != "https://api.github.com" {
			t.Fatalf("expected api.github.com, got %q", got)
		}
	})

	t.Run("maps GHES to api v3", func(t *testing.T) {
		got, err := githubAPIRoot("https://github.enterprise.local")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != "https://github.enterprise.local/api/v3" {
			t.Fatalf("expected GHES api v3 root, got %q", got)
		}
	})
}

func githubTestTarget(baseURL string, token string, repositories []models.GitHubRepositoryTarget) models.GitHubCollectTarget {
	return models.GitHubCollectTarget{
		ID:           "github",
		Name:         "GitHub",
		BaseURL:      baseURL,
		Token:        token,
		Repositories: repositories,
	}
}

func githubTestRepository(fullName string) models.GitHubRepositoryTarget {
	return models.GitHubRepositoryTarget{
		Name:          fullName,
		FullName:      fullName,
		DefaultBranch: "main",
	}
}

func writeGitHubTestPayload(w http.ResponseWriter, r *http.Request) {
	writeGitHubTestPayloadWithRun(w, r, "completed", stringPtr("success"))
}

func writeGitHubTestPayloadWithRun(w http.ResponseWriter, r *http.Request, status string, conclusion *string) {
	w.Header().Set("Content-Type", "application/json")
	switch {
	case strings.Contains(r.URL.Path, "/commits"):
		_ = json.NewEncoder(w).Encode([]map[string]any{
			{
				"sha":      "abc123",
				"html_url": "https://github.example/owner/repo/commit/abc123",
				"commit": map[string]any{
					"message": "test commit",
					"author":  map[string]any{"name": "tester", "date": "2026-05-20T00:00:00Z"},
				},
			},
		})
	case strings.Contains(r.URL.Path, "/actions/runs"):
		runs := []map[string]any{}
		if status != "" {
			runs = append(runs, map[string]any{
				"id":          1,
				"name":        "CI",
				"status":      status,
				"conclusion":  conclusion,
				"head_branch": "main",
				"updated_at":  "2026-05-20T00:00:00Z",
				"html_url":    "https://github.example/owner/repo/actions/runs/1",
			})
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"workflow_runs": runs})
	default:
		w.WriteHeader(http.StatusNotFound)
	}
}

func assertGitHubError(t *testing.T, envelope models.CollectEnvelope[models.GitHubData], status models.SourceStatus, code models.CollectErrorCode) {
	t.Helper()
	if envelope.Status != status || envelope.Error == nil || envelope.Error.Code != code {
		t.Fatalf("expected status=%s code=%s, got status=%s error=%#v", status, code, envelope.Status, envelope.Error)
	}
}

func stringPtr(value string) *string {
	return &value
}
