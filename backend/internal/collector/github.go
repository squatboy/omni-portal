package collector

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"omni-backend/internal/models"
	"strings"
	"sync"
	"time"
)

const githubAPIVersion = "2026-03-10"

type githubCommitResponse struct {
	Sha     string `json:"sha"`
	HTMLURL string `json:"html_url"`
	Commit  struct {
		Message string `json:"message"`
		Author  struct {
			Name string `json:"name"`
			Date string `json:"date"`
		} `json:"author"`
	} `json:"commit"`
}

type githubWorkflowRunsResponse struct {
	WorkflowRuns []githubWorkflowRunResponse `json:"workflow_runs"`
}

type githubWorkflowRunResponse struct {
	ID         int64   `json:"id"`
	Name       string  `json:"name"`
	Status     string  `json:"status"`
	Conclusion *string `json:"conclusion"`
	HeadBranch string  `json:"head_branch"`
	UpdatedAt  string  `json:"updated_at"`
	HTMLURL    string  `json:"html_url"`
}

type githubAPIError struct {
	code           models.CollectErrorCode
	status         models.SourceStatus
	message        string
	upstreamStatus *int
}

func (e *githubAPIError) Error() string {
	return e.message
}

func CollectGitHub(ctx context.Context, targets []models.GitHubCollectTarget) models.CollectEnvelope[models.GitHubData] {
	now := time.Now().Format(time.RFC3339)

	if len(targets) == 0 {
		collectedAt := now
		return models.CollectEnvelope[models.GitHubData]{
			Source:      models.SourceGitHub,
			Status:      models.StatusUnknown,
			AttemptedAt: now,
			CollectedAt: &collectedAt,
			Stale:       false,
			Data:        models.GitHubData{Repositories: []models.GitHubRepositoryStatus{}},
		}
	}

	var repositories []models.GitHubRepositoryStatus
	status := models.StatusOk
	var collectErr *models.CollectError
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, target := range targets {
		wg.Add(1)
		go func(target models.GitHubCollectTarget) {
			defer wg.Done()
			result := collectGitHubTarget(ctx, target, now)
			mu.Lock()
			repositories = append(repositories, result.Data.Repositories...)
			if severity(result.Status) > severity(status) {
				status = result.Status
				collectErr = result.Error
			}
			mu.Unlock()
		}(target)
	}
	wg.Wait()

	collectedAt := now
	return models.CollectEnvelope[models.GitHubData]{
		Source:      models.SourceGitHub,
		Status:      status,
		AttemptedAt: now,
		CollectedAt: &collectedAt,
		Stale:       status == models.StatusStale,
		Error:       collectErr,
		Data:        models.GitHubData{Repositories: repositories},
	}
}

func collectGitHubTarget(ctx context.Context, target models.GitHubCollectTarget, now string) models.CollectEnvelope[models.GitHubData] {
	baseURL := strings.TrimRight(target.BaseURL, "/")
	repositories := target.Repositories

	if baseURL == "" {
		return githubError(now, models.ErrConnectionFailed, "GitHub base URL is required", models.StatusDown)
	}
	if strings.TrimSpace(target.Token) == "" {
		return githubError(now, models.ErrPermissionDenied, "GitHub token is required", models.StatusPermissionError)
	}
	if len(repositories) == 0 {
		return githubError(now, models.ErrConnectionFailed, "At least one GitHub repository is required", models.StatusDown)
	}

	apiRoot, err := githubAPIRoot(baseURL)
	if err != nil {
		return githubError(now, models.ErrConnectionFailed, err.Error(), models.StatusDown)
	}

	reqCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	results := make([]models.GitHubRepositoryStatus, len(repositories))
	status := models.StatusOk
	var collectErr *models.CollectError
	var mu sync.Mutex
	var wg sync.WaitGroup
	client := &http.Client{}

	for i, repository := range repositories {
		wg.Add(1)
		go func(i int, repo models.GitHubRepositoryTarget) {
			defer wg.Done()
			repo = normalizeGitHubRepository(repo)

			link := repo.Link
			if link == nil && baseURL != "" && repo.FullName != "" {
				l := baseURL + "/" + repo.FullName
				link = &l
			}

			repositoryStatus := models.GitHubRepositoryStatus{
				GitHubRepositoryTarget: repo,
				IntegrationName:        target.Name,
			}
			repositoryStatus.Link = link

			owner, name, ok := splitGitHubFullName(repo.FullName)
			if !ok {
				mu.Lock()
				results[i] = repositoryStatus
				applyGitHubError(&githubAPIError{code: models.ErrConnectionFailed, status: models.StatusDown, message: "GitHub repository full name must be owner/repo"}, &status, &collectErr)
				mu.Unlock()
				return
			}

			repoPath := url.PathEscape(owner) + "/" + url.PathEscape(name)
			branch := url.QueryEscape(repo.DefaultBranch)
			commitsURL := apiRoot + "/repos/" + repoPath + "/commits?sha=" + branch + "&per_page=1"
			runsURL := apiRoot + "/repos/" + repoPath + "/actions/runs?branch=" + branch + "&per_page=1"

			commits, err := fetchGitHubJSON[[]githubCommitResponse](reqCtx, client, commitsURL, target.Token, "commits")
			if err == nil && len(commits) == 0 {
				err = &githubAPIError{code: models.ErrUnknownError, status: models.StatusDown, message: "GitHub commits response was empty"}
			}
			if err != nil {
				mu.Lock()
				results[i] = repositoryStatus
				applyGitHubError(err, &status, &collectErr)
				mu.Unlock()
				return
			}

			repositoryStatus.LatestCommit = &models.GitHubCommit{
				Sha:         commits[0].Sha,
				Message:     commits[0].Commit.Message,
				AuthorName:  commits[0].Commit.Author.Name,
				CommittedAt: commits[0].Commit.Author.Date,
				Link:        commits[0].HTMLURL,
			}

			runs, err := fetchGitHubJSON[githubWorkflowRunsResponse](reqCtx, client, runsURL, target.Token, "workflow runs")
			if err != nil {
				mu.Lock()
				results[i] = repositoryStatus
				applyGitHubError(err, &status, &collectErr)
				mu.Unlock()
				return
			}

			nextStatus := models.StatusOk
			if len(runs.WorkflowRuns) > 0 {
				run := runs.WorkflowRuns[0]
				repositoryStatus.LatestWorkflowRun = &models.GitHubWorkflowRun{
					ID:         run.ID,
					Name:       run.Name,
					Status:     strings.ToLower(run.Status),
					Conclusion: lowerStringPtr(run.Conclusion),
					Branch:     run.HeadBranch,
					UpdatedAt:  run.UpdatedAt,
					Link:       run.HTMLURL,
				}
				nextStatus = githubWorkflowSourceStatus(repositoryStatus.LatestWorkflowRun)
			}

			mu.Lock()
			results[i] = repositoryStatus
			if severity(nextStatus) > severity(status) {
				status = nextStatus
			}
			mu.Unlock()
		}(i, repository)
	}

	wg.Wait()

	if reqCtx.Err() == context.DeadlineExceeded {
		return githubError(now, models.ErrTimeout, "GitHub API check timed out", models.StatusTimeout)
	}

	collectedAt := now
	return models.CollectEnvelope[models.GitHubData]{
		Source:      models.SourceGitHub,
		Status:      status,
		AttemptedAt: now,
		CollectedAt: &collectedAt,
		Stale:       status == models.StatusStale,
		Error:       collectErr,
		Data:        models.GitHubData{Repositories: results},
	}
}

func normalizeGitHubRepository(repo models.GitHubRepositoryTarget) models.GitHubRepositoryTarget {
	if strings.TrimSpace(repo.FullName) == "" {
		repo.FullName = strings.TrimSpace(repo.Name)
	}
	if strings.TrimSpace(repo.Name) == "" {
		repo.Name = repo.FullName
	}
	if strings.TrimSpace(repo.DefaultBranch) == "" {
		repo.DefaultBranch = "main"
	}
	return repo
}

func splitGitHubFullName(fullName string) (string, string, bool) {
	parts := strings.Split(strings.Trim(strings.TrimSpace(fullName), "/"), "/")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	return parts[0], parts[1], true
}

func githubAPIRoot(baseURL string) (string, error) {
	trimmed := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if trimmed == "https://github.com" {
		return "https://api.github.com", nil
	}
	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", fmt.Errorf("GitHub base URL is invalid")
	}
	return trimmed + "/api/v3", nil
}

func fetchGitHubJSON[T any](ctx context.Context, client *http.Client, endpoint string, token string, label string) (T, error) {
	var out T
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return out, &githubAPIError{code: models.ErrConnectionFailed, status: models.StatusDown, message: err.Error()}
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", githubAPIVersion)
	req.Header.Set("User-Agent", "omni-portal")

	resp, err := client.Do(req)
	if err != nil {
		code := models.ErrConnectionFailed
		status := models.StatusDown
		if ctx.Err() == context.DeadlineExceeded {
			code = models.ErrTimeout
			status = models.StatusTimeout
		}
		return out, &githubAPIError{code: code, status: status, message: err.Error()}
	}
	defer resp.Body.Close()

	body, readErr := io.ReadAll(resp.Body)
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		code := models.ErrConnectionFailed
		status := models.StatusDown
		message := fmt.Sprintf("GitHub %s API responded with %d", label, resp.StatusCode)
		if readErr == nil {
			message = githubErrorMessage(label, resp.StatusCode, body)
		}
		if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
			code = models.ErrPermissionDenied
			status = models.StatusPermissionError
		}
		if isGitHubRateLimitResponse(resp, body) {
			code = models.ErrConnectionFailed
			status = models.StatusDown
		}
		upstreamStatus := resp.StatusCode
		return out, &githubAPIError{code: code, status: status, message: message, upstreamStatus: &upstreamStatus}
	}
	if readErr != nil {
		return out, &githubAPIError{code: models.ErrConnectionFailed, status: models.StatusDown, message: readErr.Error()}
	}

	if err := json.Unmarshal(body, &out); err != nil {
		return out, &githubAPIError{code: models.ErrUnknownError, status: models.StatusDown, message: fmt.Sprintf("Failed to parse GitHub %s response", label)}
	}

	return out, nil
}

func githubErrorMessage(label string, status int, body []byte) string {
	var payload struct {
		Message string `json:"message"`
	}
	if err := json.Unmarshal(body, &payload); err == nil && strings.TrimSpace(payload.Message) != "" {
		return fmt.Sprintf("GitHub %s API responded with %d: %s", label, status, payload.Message)
	}
	return fmt.Sprintf("GitHub %s API responded with %d", label, status)
}

func isGitHubRateLimitResponse(resp *http.Response, body []byte) bool {
	if resp.StatusCode == http.StatusTooManyRequests {
		return true
	}
	lowerBody := strings.ToLower(string(body))
	return resp.Header.Get("X-RateLimit-Remaining") == "0" ||
		strings.Contains(lowerBody, "rate limit") ||
		strings.Contains(lowerBody, "secondary rate")
}

func githubWorkflowSourceStatus(run *models.GitHubWorkflowRun) models.SourceStatus {
	if run == nil {
		return models.StatusOk
	}
	status := strings.ToLower(run.Status)
	if status == "queued" || status == "in_progress" || status == "waiting" || status == "requested" {
		return models.StatusProgressing
	}
	if run.Conclusion == nil {
		return models.StatusOk
	}
	switch strings.ToLower(*run.Conclusion) {
	case "failure", "cancelled", "timed_out", "action_required":
		return models.StatusStale
	case "success":
		return models.StatusOk
	default:
		return models.StatusOk
	}
}

func lowerStringPtr(value *string) *string {
	if value == nil {
		return nil
	}
	lower := strings.ToLower(*value)
	return &lower
}

func applyGitHubError(err error, status *models.SourceStatus, collectErr **models.CollectError) {
	apiErr, ok := err.(*githubAPIError)
	if !ok {
		apiErr = &githubAPIError{code: models.ErrUnknownError, status: models.StatusDown, message: err.Error()}
	}
	if severity(apiErr.status) > severity(*status) {
		*status = apiErr.status
		*collectErr = &models.CollectError{Code: apiErr.code, Message: apiErr.message, UpstreamStatus: apiErr.upstreamStatus}
	}
}

func githubError(now string, code models.CollectErrorCode, msg string, status models.SourceStatus) models.CollectEnvelope[models.GitHubData] {
	return models.CollectEnvelope[models.GitHubData]{
		Source:      models.SourceGitHub,
		Status:      status,
		AttemptedAt: now,
		Stale:       false,
		Error:       &models.CollectError{Code: code, Message: msg},
		Data:        models.GitHubData{Repositories: []models.GitHubRepositoryStatus{}},
	}
}
