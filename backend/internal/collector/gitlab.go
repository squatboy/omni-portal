package collector

import (
	"context"
	"encoding/json"
	"fmt"
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
			Status:      models.StatusUnknown,
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

	if baseUrl == "" {
		return gitlabError(now, models.ErrConnectionFailed, "GitLab base URL is required", models.StatusDown)
	}
	if strings.TrimSpace(target.Token) == "" {
		return gitlabError(now, models.ErrPermissionDenied, "GitLab token is required", models.StatusPermissionError)
	}
	if len(projects) == 0 {
		return gitlabError(now, models.ErrConnectionFailed, "At least one GitLab project is required", models.StatusDown)
	}

	reqCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	results := make([]models.GitLabProjectStatus, len(projects))
	var wg sync.WaitGroup
	var isStale bool
	var collectErr *models.CollectError
	status := models.StatusOk
	var mu sync.Mutex
	client := &http.Client{}

	for i, proj := range projects {
		wg.Add(1)
		go func(i int, p models.GitLabProjectTarget) {
			defer wg.Done()
			p = normalizeGitLabProject(p)

			link := p.Link
			if link == nil && baseUrl != "" && p.Path != "" {
				l := baseUrl + "/" + p.Path
				link = &l
			}

			projectStatus := models.GitLabProjectStatus{
				GitLabProjectTarget: p,
				IntegrationName:     target.Name,
			}
			projectStatus.Link = link

			if strings.TrimSpace(p.Path) == "" {
				mu.Lock()
				results[i] = projectStatus
				if severity(models.StatusDown) > severity(status) {
					status = models.StatusDown
					collectErr = &models.CollectError{Code: models.ErrConnectionFailed, Message: "GitLab project path is required"}
				}
				mu.Unlock()
				return
			}

			pathEncoded := url.QueryEscape(p.Path)
			branchEncoded := url.QueryEscape(p.DefaultBranch)

			commitsUrl := baseUrl + "/api/v4/projects/" + pathEncoded + "/repository/commits?ref_name=" + branchEncoded + "&per_page=1"
			pipelinesUrl := baseUrl + "/api/v4/projects/" + pathEncoded + "/pipelines?ref=" + branchEncoded + "&per_page=1"

			commits, err := fetchGitLabJSON[[]gitlabCommitResponse](reqCtx, client, commitsUrl, target.Token, "commits")
			if err == nil && len(commits) == 0 {
				err = &gitlabAPIError{code: models.ErrUnknownError, status: models.StatusDown, message: "GitLab commits response was empty"}
			}
			if err != nil {
				mu.Lock()
				results[i] = projectStatus
				applyGitLabError(err, &status, &collectErr)
				mu.Unlock()
				return
			}

			projectStatus.LatestCommit = &models.GitLabCommit{
				Sha:         commits[0].Id,
				Title:       commits[0].Title,
				AuthorName:  commits[0].AuthorName,
				CommittedAt: commits[0].CreatedAt,
			}

			pipelines, err := fetchGitLabJSON[[]gitlabPipelineResponse](reqCtx, client, pipelinesUrl, target.Token, "pipelines")
			if err != nil {
				mu.Lock()
				results[i] = projectStatus
				applyGitLabError(err, &status, &collectErr)
				mu.Unlock()
				return
			}

			if len(pipelines) > 0 {
				pStatus := strings.ToLower(pipelines[0].Status)
				mappedStatus := "unknown"
				if pStatus == "success" || pStatus == "failed" || pStatus == "running" || pStatus == "pending" || pStatus == "canceled" {
					mappedStatus = pStatus
				}

				projectStatus.LatestPipeline = &models.GitLabPipeline{
					Id:        pipelines[0].Id,
					Status:    mappedStatus,
					Ref:       pipelines[0].Ref,
					UpdatedAt: pipelines[0].UpdatedAt,
					Link:      pipelines[0].WebUrl,
				}
			} else {
				projectStatus.LatestPipeline = nil
			}

			mu.Lock()
			results[i] = projectStatus
			if projectStatus.LatestPipeline != nil && (projectStatus.LatestPipeline.Status == "failed" || projectStatus.LatestPipeline.Status == "canceled") {
				isStale = true
			}
			mu.Unlock()

		}(i, proj)
	}

	wg.Wait()

	if reqCtx.Err() == context.DeadlineExceeded {
		return gitlabError(now, models.ErrTimeout, "GitLab API check timed out", models.StatusTimeout)
	}

	if status == models.StatusOk && isStale {
		status = models.StatusStale
	}

	collectedAt := now
	return models.CollectEnvelope[models.GitLabData]{
		Source:      models.SourceGitLab,
		Status:      status,
		AttemptedAt: now,
		CollectedAt: &collectedAt,
		Stale:       status == models.StatusStale,
		Error:       collectErr,
		Data:        models.GitLabData{Projects: results},
	}
}

func normalizeGitLabProject(p models.GitLabProjectTarget) models.GitLabProjectTarget {
	if strings.TrimSpace(p.Path) == "" {
		p.Path = strings.TrimSpace(p.Name)
	}
	if strings.TrimSpace(p.Name) == "" {
		p.Name = p.Path
	}
	if strings.TrimSpace(p.DefaultBranch) == "" {
		p.DefaultBranch = "main"
	}
	return p
}

type gitlabAPIError struct {
	code           models.CollectErrorCode
	status         models.SourceStatus
	message        string
	upstreamStatus *int
}

func (e *gitlabAPIError) Error() string {
	return e.message
}

func fetchGitLabJSON[T any](ctx context.Context, client *http.Client, endpoint string, token string, label string) (T, error) {
	var out T
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return out, &gitlabAPIError{code: models.ErrConnectionFailed, status: models.StatusDown, message: err.Error()}
	}
	req.Header.Set("PRIVATE-TOKEN", token)
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		code := models.ErrConnectionFailed
		status := models.StatusDown
		if ctx.Err() == context.DeadlineExceeded {
			code = models.ErrTimeout
			status = models.StatusTimeout
		}
		return out, &gitlabAPIError{code: code, status: status, message: err.Error()}
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		code := models.ErrConnectionFailed
		status := models.StatusDown
		if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
			code = models.ErrPermissionDenied
			status = models.StatusPermissionError
		}
		upstreamStatus := resp.StatusCode
		return out, &gitlabAPIError{code: code, status: status, message: fmt.Sprintf("GitLab %s API responded with %d", label, resp.StatusCode), upstreamStatus: &upstreamStatus}
	}

	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return out, &gitlabAPIError{code: models.ErrUnknownError, status: models.StatusDown, message: fmt.Sprintf("Failed to parse GitLab %s response", label)}
	}

	return out, nil
}

func applyGitLabError(err error, status *models.SourceStatus, collectErr **models.CollectError) {
	apiErr, ok := err.(*gitlabAPIError)
	if !ok {
		apiErr = &gitlabAPIError{code: models.ErrUnknownError, status: models.StatusDown, message: err.Error()}
	}
	if severity(apiErr.status) > severity(*status) {
		*status = apiErr.status
		*collectErr = &models.CollectError{Code: apiErr.code, Message: apiErr.message, UpstreamStatus: apiErr.upstreamStatus}
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
