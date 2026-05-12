import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CollectInventoryConfig } from "@/lib/collect/types"
import { testEnv } from "@/lib/collect/test-env"

const baseConfig: CollectInventoryConfig = {
  nexus: { url: testEnv.nexusUrl },
  gitlab: {
    baseUrl: testEnv.gitlabBaseUrl,
    projects: [
      {
        name: "sth-approval-system",
        path: "sth/sth-approval-system",
        defaultBranch: "main",
      },
      {
        name: "sth-approval-system-admin",
        path: "sth/sth-approval-system-admin",
        defaultBranch: "main",
      },
      {
        name: "sth-portal-member-backend",
        path: "sth/sth-portal-member-backend",
        defaultBranch: "main",
      },
    ],
  },
  argocd: { baseUrl: testEnv.argocdBaseUrl },
  kubernetes: {
    clusterName: "sth-prod-cluster",
    namespaces: [],
    appNamespaces: [],
  },
  vms: [],
}

let testConfig: CollectInventoryConfig = structuredClone(baseConfig)

vi.mock("@/lib/collect/config", () => ({
  getInventoryConfig: () => testConfig,
}))

import { collectGitLab } from "@/lib/collect/gitlab"

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function extractProjectPath(url: string) {
  const match = url.match(/\/projects\/([^/]+)\//)
  return match ? decodeURIComponent(match[1]) : ""
}

describe("collectGitLab", () => {
  const fetchMock = vi.fn()
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    testConfig = structuredClone(baseConfig)
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch)
    delete process.env.GITLAB_TOKEN
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    consoleErrorSpy.mockRestore()
    delete process.env.GITLAB_TOKEN
  })

  it("returns permission_error when GITLAB_TOKEN is missing", async () => {
    const result = await collectGitLab(new AbortController().signal)

    expect(result.status).toBe("permission_error")
    expect(result.error?.code).toBe("PERMISSION_DENIED")
    expect(result.data.projects).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("collects latest commit and latest pipeline for configured repos only", async () => {
    process.env.GITLAB_TOKEN = "token-for-test"

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      const projectPath = extractProjectPath(url)

      if (url.includes("/repository/commits")) {
        return jsonResponse([
          {
            id: `${projectPath}-sha`,
            title: `${projectPath} latest commit`,
            author_name: "omni-bot",
            created_at: "2026-05-12T03:00:00.000Z",
          },
        ])
      }

      if (url.includes("/pipelines")) {
        return jsonResponse([
          {
            id: projectPath.length,
            status: "success",
            ref: "main",
            updated_at: "2026-05-12T03:05:00.000Z",
            web_url: `${testEnv.gitlabBaseUrl}/${projectPath}/-/pipelines/1`,
          },
        ])
      }

      return jsonResponse([], 404)
    })

    const result = await collectGitLab(new AbortController().signal)

    expect(result.status).toBe("ok")
    expect(result.error).toBeNull()
    expect(result.data.projects).toHaveLength(3)

    for (const project of result.data.projects) {
      expect(project.latestCommit?.sha).toContain(project.path)
      expect(project.latestPipeline?.status).toBe("success")
      expect(project.latestPipeline?.ref).toBe("main")
      expect(project.link).toBe(
        `${testEnv.gitlabBaseUrl}/${project.path}`
      )
    }

    expect(fetchMock).toHaveBeenCalledTimes(6)

    const requestedUrls = fetchMock.mock.calls.map((args) => String(args[0]))
    expect(
      requestedUrls.every(
        (url) => url.includes("ref_name=main") || url.includes("ref=main")
      )
    ).toBe(true)

    const requestedProjectPaths = new Set(
      requestedUrls.map((url) => extractProjectPath(url))
    )
    expect(requestedProjectPaths).toEqual(
      new Set(baseConfig.gitlab.projects.map((project) => project.path))
    )
  })

  it("keeps per-project failures isolated and never logs token values", async () => {
    process.env.GITLAB_TOKEN = "super-secret-token"

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      const projectPath = extractProjectPath(url)

      if (projectPath === "sth/sth-approval-system-admin") {
        throw new Error("Project API failure")
      }

      if (url.includes("/repository/commits")) {
        return jsonResponse([
          {
            id: `${projectPath}-sha`,
            title: "ok",
            author_name: "omni-bot",
            created_at: "2026-05-12T03:10:00.000Z",
          },
        ])
      }

      if (url.includes("/pipelines")) {
        return jsonResponse([
          {
            id: 1,
            status: "running",
            ref: "main",
            updated_at: "2026-05-12T03:11:00.000Z",
            web_url: `${testEnv.gitlabBaseUrl}/${projectPath}/-/pipelines/1`,
          },
        ])
      }

      return jsonResponse([], 404)
    })

    const result = await collectGitLab(new AbortController().signal)

    expect(result.status).toBe("ok")

    const failedProject = result.data.projects.find(
      (project) => project.path === "sth/sth-approval-system-admin"
    )
    expect(failedProject?.latestCommit).toBeNull()
    expect(failedProject?.latestPipeline).toBeNull()

    const successfulProjects = result.data.projects.filter(
      (project) => project.path !== "sth/sth-approval-system-admin"
    )
    expect(
      successfulProjects.every(
        (project) => project.latestCommit && project.latestPipeline
      )
    ).toBe(true)

    const loggedText = consoleErrorSpy.mock.calls
      .flat()
      .map((value: unknown) => String(value))
      .join(" ")
    expect(loggedText).not.toContain("super-secret-token")
  })
})
