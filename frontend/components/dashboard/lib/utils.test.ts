import { afterEach, describe, expect, it, vi } from "vitest"

import type { CollectEnvelope, SourceStatus } from "@/lib/collect/types"
import type { DashboardSnapshot } from "./types"
import {
  allRuntimeSourcesFailed,
  badgeVariant,
  loadSnapshot,
  statusColor,
} from "./utils"

describe("dashboard status helpers", () => {
  it("maps healthy sources to the default badge style", () => {
    expect(badgeVariant("ok")).toBe("secondary")
    expect(statusColor("ok")).toBe("var(--status-ok)")
  })

  it("keeps stale or failed sources visually distinct", () => {
    expect(badgeVariant("down")).toBe("destructive")
    expect(badgeVariant("ok", true)).toBe("outline")
    expect(statusColor("timeout")).toBe("var(--status-warn)")
    expect(statusColor("permission_error")).toBe("var(--status-down)")
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("loads 207 snapshots without treating them as polling failures", async () => {
    const snapshot = createSnapshot({ nexus: "down" })
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(snapshot), { status: 207 })
        )
    )

    await expect(loadSnapshot()).resolves.toMatchObject({
      nexus: { status: "down" },
    })
  })

  it("loads 502 snapshots when the response body is still a snapshot", async () => {
    const snapshot = createSnapshot({
      vms: "down",
      kubernetes: "timeout",
      argocd: "permission_error",
      gitlab: "down",
      nexus: "down",
    })
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(snapshot), { status: 502 })
        )
    )

    const loaded = await loadSnapshot()

    expect(allRuntimeSourcesFailed(loaded)).toBe(true)
  })

  it("rejects non-snapshot 502 responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: "bad gateway" }), {
            status: 502,
          })
        )
    )

    await expect(loadSnapshot()).rejects.toThrow(
      "Collect snapshot API returned 502"
    )
  })
})

function createSnapshot(
  statuses: Partial<
    Record<keyof Omit<DashboardSnapshot, "overview">, SourceStatus>
  >
): DashboardSnapshot {
  const now = "2026-05-21T00:00:00Z"
  const runtimeStatuses = {
    vms: statuses.vms ?? "ok",
    kubernetes: statuses.kubernetes ?? "ok",
    argocd: statuses.argocd ?? "ok",
    gitlab: statuses.gitlab ?? "ok",
    nexus: statuses.nexus ?? "ok",
  }

  return {
    overview: envelope("overview", "ok", {
      health: Object.values(runtimeStatuses).some((status) => status !== "ok")
        ? "degraded"
        : "ok",
      generatedAt: now,
      sources: Object.entries(runtimeStatuses).map(([source, status]) => ({
        source: source as keyof typeof runtimeStatuses,
        status,
        attemptedAt: now,
        collectedAt: status === "ok" ? now : null,
        stale: false,
        error:
          status === "ok"
            ? null
            : { code: "CONNECTION_FAILED", message: "failed" },
      })),
    }),
    vms: envelope("vms", runtimeStatuses.vms, { items: [] }),
    kubernetes: envelope("kubernetes", runtimeStatuses.kubernetes, {
      name: "test",
      nodes: [],
      namespaces: [],
      workloads: [],
      pods: { total: 0, ready: 0, notReady: 0, restarting: 0 },
      services: { total: 0 },
      ingresses: { total: 0, hosts: [] },
      pvcs: { total: 0, bound: 0, pending: 0 },
    }),
    argocd: envelope("argocd", runtimeStatuses.argocd, { applications: [] }),
    gitlab: envelope("gitlab", runtimeStatuses.gitlab, { projects: [] }),
    nexus: envelope("nexus", runtimeStatuses.nexus, {
      items: [],
      url: "",
      reachable: false,
      httpStatus: null,
      checkedAt: "",
    }),
  }
}

function envelope<
  TData,
  TSource extends DashboardSnapshot[keyof DashboardSnapshot]["source"],
>(
  source: TSource,
  status: SourceStatus,
  data: TData
): CollectEnvelope<TData, TSource> {
  const failed =
    status === "down" || status === "timeout" || status === "permission_error"

  return {
    source,
    status,
    attemptedAt: "2026-05-21T00:00:00Z",
    collectedAt: failed ? null : "2026-05-21T00:00:00Z",
    stale: false,
    error: failed ? { code: "CONNECTION_FAILED", message: "failed" } : null,
    data,
  }
}
