import { getInventoryConfig } from "@/lib/collect/config"
import { GitLabProjectStatus } from "@/lib/collect/types"
import { CollectAdapterResult } from "@/lib/collect/adapters"

export async function collectGitLab(
  signal: AbortSignal
): Promise<CollectAdapterResult<"gitlab">> {
  const config = getInventoryConfig()
  const gitlabConfig = config.gitlab

  if (!gitlabConfig || !gitlabConfig.baseUrl) {
    return {
      status: "unknown",
      collectedAt: new Date().toISOString(),
      stale: false,
      error: { code: "UNKNOWN_ERROR", message: "GitLab base URL not configured" },
      data: { projects: [] },
    }
  }

  const token = process.env.GITLAB_TOKEN
  if (!token) {
    return {
      status: "permission_error",
      collectedAt: new Date().toISOString(),
      stale: false,
      error: { code: "PERMISSION_DENIED", message: "GITLAB_TOKEN is missing" },
      data: { projects: [] },
    }
  }

  const baseUrl = gitlabConfig.baseUrl.replace(/\/$/, "")
  const headers = {
    "PRIVATE-TOKEN": token,
    Accept: "application/json",
  }

  const now = new Date().toISOString()

  try {
    const projectPromises = gitlabConfig.projects.map(async (project) => {
      const pathEncoded = encodeURIComponent(project.path)
      const branchEncoded = encodeURIComponent(project.defaultBranch)
      
      const commitsUrl = `${baseUrl}/api/v4/projects/${pathEncoded}/repository/commits?ref_name=${branchEncoded}&per_page=1`
      const pipelinesUrl = `${baseUrl}/api/v4/projects/${pathEncoded}/pipelines?ref=${branchEncoded}&per_page=1`
      
      const link = project.link || `${baseUrl}/${project.path}`

      let latestCommit: GitLabProjectStatus["latestCommit"] = null
      let latestPipeline: GitLabProjectStatus["latestPipeline"] = null

      try {
        const [commitsRes, pipelinesRes] = await Promise.all([
          fetch(commitsUrl, { headers, signal }),
          fetch(pipelinesUrl, { headers, signal }),
        ])

        if (commitsRes.ok) {
          const commits = await commitsRes.json()
          if (commits && commits.length > 0) {
            const commit = commits[0]
            latestCommit = {
              sha: commit.id,
              title: commit.title,
              authorName: commit.author_name,
              committedAt: commit.created_at,
            }
          }
        }

        if (pipelinesRes.ok) {
          const pipelines = await pipelinesRes.json()
          if (pipelines && pipelines.length > 0) {
            const pipeline = pipelines[0]
            
            // Map gitlab status to our known status types
            let mappedStatus: NonNullable<GitLabProjectStatus["latestPipeline"]>["status"] = "unknown"
            const pStatus = pipeline.status?.toLowerCase()
            if (pStatus === "success" || pStatus === "failed" || pStatus === "running" || pStatus === "pending" || pStatus === "canceled") {
              mappedStatus = pStatus as NonNullable<GitLabProjectStatus["latestPipeline"]>["status"]
            }
            
            latestPipeline = {
              id: pipeline.id,
              status: mappedStatus,
              ref: pipeline.ref,
              updatedAt: pipeline.updated_at,
              link: pipeline.web_url || `${link}/-/pipelines/${pipeline.id}`,
            }
          }
        }

      } catch (err: unknown) {
        console.error(`Failed to fetch data for GitLab project ${project.name}:`, err)
        // Individual project failure does not fail the whole envelope, we just leave commit/pipeline as null
      }

      return {
        ...project,
        link,
        latestCommit,
        latestPipeline,
      } as GitLabProjectStatus
    })

    const projectsData = await Promise.all(projectPromises)

    return {
      status: "ok",
      collectedAt: now,
      stale: false,
      error: null,
      data: {
        projects: projectsData,
      },
    }

  } catch (err: unknown) {
    let errorCode: "TIMEOUT" | "CONNECTION_FAILED" | "UNKNOWN_ERROR" = "CONNECTION_FAILED"
    let message = err instanceof Error ? err.message : "Unknown error"

    if (err instanceof Error && err.name === "AbortError") {
      errorCode = "TIMEOUT"
      message = "GitLab API check timed out"
    }

    return {
      status: errorCode === "TIMEOUT" ? "timeout" : "down",
      collectedAt: now,
      stale: false,
      error: { code: errorCode, message },
      data: { projects: [] },
    }
  }
}
