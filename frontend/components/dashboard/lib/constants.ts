import * as React from "react"
import { Boxes, GitBranch, Package, Server, Workflow } from "lucide-react"

import type { CollectSource, SourceStatus } from "@/lib/collect/types"
import type { SourceKey } from "./types"

export const POLL_INTERVAL_MS = 15_000

export const sourceLabels: Record<CollectSource, string> = {
  overview: "Overview",
  vms: "VM Inventory",
  kubernetes: "Kubernetes",
  argocd: "Argo CD",
  gitlab: "GitLab",
  nexus: "Nexus",
}

export const statusLabels: Record<SourceStatus, string> = {
  ok: "OK",
  progressing: "PROGRESSING",
  down: "DOWN",
  timeout: "TIMEOUT",
  permission_error: "PERMISSION",
  stale: "STALE",
  unknown: "UNKNOWN",
}

export const sourceIcons: Record<
  SourceKey,
  React.ComponentType<{ className?: string }>
> = {
  vms: Server,
  kubernetes: Boxes,
  argocd: Workflow,
  gitlab: GitBranch,
  nexus: Package,
}

export const sourceOrder: SourceKey[] = [
  "kubernetes",
  "vms",
  "argocd",
  "gitlab",
  "nexus",
]
