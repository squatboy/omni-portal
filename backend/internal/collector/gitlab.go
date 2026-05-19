package collector

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"omni-backend/internal/config"
	"omni-backend/internal/models"
	"os"
	"strings"
	"sync"
	"time"
)

type gitlabCommitResponse struct {
	Id         string `json:"id"`
	Title      string `json:"title"`
	AuthorName string `json:"author_name"`
	CreatedAt  string `json:"created_at"`
}

type gitlabPipelineResponse struct {
	Id        int    `json:"id"`
	Status    string `json:"status"`
	Ref       string `json:"ref"`
	UpdatedAt string `json:"updated_at"`
	WebUrl    string `json:"web_url"`
}

func CollectGitLab(ctx context.Context, cfg *config.AppConfig) models.CollectEnvelope[models.GitLabData] {
	baseUrl := strings.TrimRight(cfg.Inventory.GitLab.BaseUrl, "/")
	projects := cfg.Inventory.GitLab.Projects
	now := time.Now().Format(time.RFC3339)

	if baseUrl == "" {
		return gitlabError(now, models.ErrUnknownError, "GitLab base URL not configured", models.StatusUnknown)
	}

	token := strings.TrimSpace(os.Getenv("GITLAB_TOKEN"))
	if token == "" {
		return gitlabError(now, models.ErrPermissionDenied, "GITLAB_TOKEN is missing", models.StatusPermissionError)
	}

	reqCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	results := make([]models.GitLabProjectStatus, len(projects))
	var wg sync.WaitGroup
	var isStale bool
	var mu sync.Mutex
	client := &http.Client{}

	for i, proj := range projects {
		wg.Add(1)
		go func(i int, p models.GitLabProjectTarget) {
			defer wg.Done()

			pathEncoded := url.QueryEscape(p.Path)
			branchEncoded := url.QueryEscape(p.DefaultBranch)

			commitsUrl := baseUrl + "/api/v4/projects/" + pathEncoded + "/repository/commits?ref_name=" + branchEncoded + "&per_page=1"
			pipelinesUrl := baseUrl + "/api/v4/projects/" + pathEncoded + "/pipelines?ref=" + branchEncoded + "&per_page=1"

			link := p.Link
			if link == nil {
				l := baseUrl + "/" + p.Path
				link = &l
			}

			var latestCommit *models.GitLabCommit
			var latestPipeline *models.GitLabPipeline

			// Fetch Commits
			reqC, _ := http.NewRequestWithContext(reqCtx, "GET", commitsUrl, nil)
			reqC.Header.Set("PRIVATE-TOKEN", token)
			reqC.Header.Set("Accept", "application/json")
			if resC, err := client.Do(reqC); err == nil {
				if resC.StatusCode == 200 {
					var commits []gitlabCommitResponse
					if json.NewDecoder(resC.Body).Decode(&commits) == nil && len(commits) > 0 {
						latestCommit = &models.GitLabCommit{
							Sha:         commits[0].Id,
							Title:       commits[0].Title,
							AuthorName:  commits[0].AuthorName,
							CommittedAt: commits[0].CreatedAt,
						}
					}
				}
				resC.Body.Close()
			}

			// Fetch Pipelines
			reqP, _ := http.NewRequestWithContext(reqCtx, "GET", pipelinesUrl, nil)
			reqP.Header.Set("PRIVATE-TOKEN", token)
			reqP.Header.Set("Accept", "application/json")
			if resP, err := client.Do(reqP); err == nil {
				if resP.StatusCode == 200 {
					var pipelines []gitlabPipelineResponse
					if json.NewDecoder(resP.Body).Decode(&pipelines) == nil && len(pipelines) > 0 {
						pStatus := strings.ToLower(pipelines[0].Status)
						mappedStatus := "unknown"
						if pStatus == "success" || pStatus == "failed" || pStatus == "running" || pStatus == "pending" || pStatus == "canceled" {
							mappedStatus = pStatus
						}
						plink := pipelines[0].WebUrl
						if plink == "" {
							// fallback
						}

						latestPipeline = &models.GitLabPipeline{
							Id:        pipelines[0].Id,
							Status:    mappedStatus,
							Ref:       pipelines[0].Ref,
							UpdatedAt: pipelines[0].UpdatedAt,
							Link:      plink,
						}
					}
				}
				resP.Body.Close()
			}

			mu.Lock()
			results[i] = models.GitLabProjectStatus{
				GitLabProjectTarget: p,
				LatestCommit:        latestCommit,
				LatestPipeline:      latestPipeline,
			}
			results[i].Link = link

			if latestPipeline != nil && (latestPipeline.Status == "failed" || latestPipeline.Status == "canceled") {
				isStale = true
			}
			mu.Unlock()

		}(i, proj)
	}

	wg.Wait()

	if reqCtx.Err() == context.DeadlineExceeded {
		return gitlabError(now, models.ErrTimeout, "GitLab API check timed out", models.StatusTimeout)
	}

	status := models.StatusOk
	if isStale {
		status = models.StatusStale
	}

	collectedAt := now
	return models.CollectEnvelope[models.GitLabData]{
		Source:      models.SourceGitLab,
		Status:      status,
		AttemptedAt: now,
		CollectedAt: &collectedAt,
		Stale:       false,
		Error:       nil,
		Data:        models.GitLabData{Projects: results},
	}
}

func gitlabError(now string, code models.CollectErrorCode, msg string, status models.SourceStatus) models.CollectEnvelope[models.GitLabData] {
	return models.CollectEnvelope[models.GitLabData]{
		Source:      models.SourceGitLab,
		Status:      status,
		AttemptedAt: now,
		Stale:       false,
		Error:       &models.CollectError{Code: code, Message: msg},
		Data:        models.GitLabData{Projects: []models.GitLabProjectStatus{}},
	}
}
