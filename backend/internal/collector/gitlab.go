package collector

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"omni-backend/internal/models"
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

func CollectGitLab(ctx context.Context, targets []models.GitLabCollectTarget) models.CollectEnvelope[models.GitLabData] {
	now := time.Now().Format(time.RFC3339)

	if len(targets) == 0 {
		collectedAt := now
		return models.CollectEnvelope[models.GitLabData]{
			Source:      models.SourceGitLab,
			Status:      models.StatusOk,
			AttemptedAt: now,
			CollectedAt: &collectedAt,
			Stale:       false,
			Data:        models.GitLabData{Projects: []models.GitLabProjectStatus{}},
		}
	}

	var projects []models.GitLabProjectStatus
	status := models.StatusOk
	var collectErr *models.CollectError
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, target := range targets {
		wg.Add(1)
		go func(target models.GitLabCollectTarget) {
			defer wg.Done()
			result := collectGitLabTarget(ctx, target, now)
			mu.Lock()
			projects = append(projects, result.Data.Projects...)
			if severity(result.Status) > severity(status) {
				status = result.Status
				collectErr = result.Error
			}
			mu.Unlock()
		}(target)
	}
	wg.Wait()

	collectedAt := now
	return models.CollectEnvelope[models.GitLabData]{
		Source:      models.SourceGitLab,
		Status:      status,
		AttemptedAt: now,
		CollectedAt: &collectedAt,
		Stale:       status == models.StatusStale,
		Error:       collectErr,
		Data:        models.GitLabData{Projects: projects},
	}
}

func collectGitLabTarget(ctx context.Context, target models.GitLabCollectTarget, now string) models.CollectEnvelope[models.GitLabData] {
	baseUrl := strings.TrimRight(target.BaseURL, "/")
	projects := target.Projects

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
			reqC.Header.Set("PRIVATE-TOKEN", target.Token)
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
			reqP.Header.Set("PRIVATE-TOKEN", target.Token)
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
				IntegrationName:     target.Name,
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
