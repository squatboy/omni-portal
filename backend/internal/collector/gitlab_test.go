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

func TestCollectGitLabFailureMapping(t *testing.T) {
	t.Run("missing token", func(t *testing.T) {
		envelope := CollectGitLab(context.Background(), []models.GitLabCollectTarget{
			gitlabTestTarget("https://gitlab.example.internal", "", []models.GitLabProjectTarget{gitlabTestProject("group/repo")}),
		})

		assertGitLabError(t, envelope, models.StatusPermissionError, models.ErrPermissionDenied)
	})

	t.Run("missing projects", func(t *testing.T) {
		envelope := CollectGitLab(context.Background(), []models.GitLabCollectTarget{
			gitlabTestTarget("https://gitlab.example.internal", "test-token", nil),
		})

		assertGitLabError(t, envelope, models.StatusDown, models.ErrConnectionFailed)
	})

	t.Run("invalid token", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("PRIVATE-TOKEN") != "valid-token" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			writeGitLabTestPayload(w, r)
		}))
		defer server.Close()

		envelope := CollectGitLab(context.Background(), []models.GitLabCollectTarget{
			gitlabTestTarget(server.URL, "bad-token", []models.GitLabProjectTarget{gitlabTestProject("group/repo")}),
		})

		assertGitLabError(t, envelope, models.StatusPermissionError, models.ErrPermissionDenied)
	})

	t.Run("invalid project path", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.Contains(r.URL.EscapedPath(), "missing%2Frepo") {
				w.WriteHeader(http.StatusNotFound)
				return
			}
			writeGitLabTestPayload(w, r)
		}))
		defer server.Close()

		envelope := CollectGitLab(context.Background(), []models.GitLabCollectTarget{
			gitlabTestTarget(server.URL, "test-token", []models.GitLabProjectTarget{gitlabTestProject("missing/repo")}),
		})

		assertGitLabError(t, envelope, models.StatusDown, models.ErrConnectionFailed)
	})

	t.Run("api 500", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
		}))
		defer server.Close()

		envelope := CollectGitLab(context.Background(), []models.GitLabCollectTarget{
			gitlabTestTarget(server.URL, "test-token", []models.GitLabProjectTarget{gitlabTestProject("group/repo")}),
		})

		assertGitLabError(t, envelope, models.StatusDown, models.ErrConnectionFailed)
	})

	t.Run("bad json", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte("{"))
		}))
		defer server.Close()

		envelope := CollectGitLab(context.Background(), []models.GitLabCollectTarget{
			gitlabTestTarget(server.URL, "test-token", []models.GitLabProjectTarget{gitlabTestProject("group/repo")}),
		})

		assertGitLabError(t, envelope, models.StatusDown, models.ErrUnknownError)
	})
}

func gitlabTestTarget(baseURL string, token string, projects []models.GitLabProjectTarget) models.GitLabCollectTarget {
	return models.GitLabCollectTarget{
		ID:       "gitlab",
		Name:     "GitLab",
		BaseURL:  baseURL,
		Token:    token,
		Projects: projects,
	}
}

func gitlabTestProject(path string) models.GitLabProjectTarget {
	return models.GitLabProjectTarget{
		Name:          path,
		Path:          path,
		DefaultBranch: "main",
	}
}

func writeGitLabTestPayload(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	switch {
	case strings.Contains(r.URL.Path, "/repository/commits"):
		_ = json.NewEncoder(w).Encode([]map[string]any{
			{"id": "abc123", "title": "test commit", "author_name": "tester", "created_at": "2026-05-20T00:00:00Z"},
		})
	case strings.Contains(r.URL.Path, "/pipelines"):
		_ = json.NewEncoder(w).Encode([]map[string]any{
			{"id": 1, "status": "success", "ref": "main", "updated_at": "2026-05-20T00:00:00Z", "web_url": "https://gitlab.example/group/repo/-/pipelines/1"},
		})
	default:
		w.WriteHeader(http.StatusNotFound)
	}
}

func assertGitLabError(t *testing.T, envelope models.CollectEnvelope[models.GitLabData], status models.SourceStatus, code models.CollectErrorCode) {
	t.Helper()
	if envelope.Status != status || envelope.Error == nil || envelope.Error.Code != code {
		t.Fatalf("expected status=%s code=%s, got status=%s error=%#v", status, code, envelope.Status, envelope.Error)
	}
}
