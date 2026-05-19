import * as React from "react"
import { ExternalLink } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import type {
  KubernetesWorkloadStatus,
  OverviewData,
  SourceStatus,
} from "@/lib/collect/types"
import { StatusBadge, StatusDot } from "./status-badge"

export function ResourceBar({
  label,
  value,
  fallback,
}: {
  label: string
  value: number | null
  fallback: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">
          {value === null ? fallback : `${value}%`}
        </span>
      </div>
      <Progress value={value ?? 0} />
    </div>
  )
}

export function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background/60 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-mono text-sm">{value}</div>
    </div>
  )
}

export function ExternalLinkButton({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild variant="outline" size="icon-xs">
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${label}`}
      >
        <ExternalLink data-icon="inline-start" />
      </a>
    </Button>
  )
}

export function HealthBadge({
  health,
}: {
  health: OverviewData["health"] | undefined
}) {
  if (!health) {
    return <Badge variant="outline">loading</Badge>
  }

  return (
    <Badge variant={health === "ok" ? "secondary" : "outline"}>
      <StatusDot status={health === "ok" ? "ok" : "stale"} />
      {health}
    </Badge>
  )
}

export function WorkloadStatusBadge({
  workload,
}: {
  workload: KubernetesWorkloadStatus
}) {
  return (
    <div className="flex flex-col items-start gap-1">
      <StatusBadge
        status={workloadStatus(workload)}
        label={
          workload.progressing
            ? "Progressing"
            : `${workload.readyReplicas}/${workload.desiredReplicas}`
        }
      />
      {workload.progressing ? (
        <span className="font-mono text-xs text-muted-foreground">
          ready {workload.readyReplicas}/{workload.desiredReplicas}
        </span>
      ) : null}
    </div>
  )
}

export function WorkloadRolloutDetail({
  workload,
}: {
  workload: KubernetesWorkloadStatus
}) {
  return (
    <div className="flex min-w-36 flex-col gap-1 font-mono text-xs">
      <span>
        updated {workload.updatedReplicas}/{workload.desiredReplicas}; pods{" "}
        {workload.replicas}
      </span>
      <span className="text-muted-foreground">
        available {workload.availableReplicas}; unavailable{" "}
        {workload.unavailableReplicas}
      </span>
    </div>
  )
}

function workloadStatus(workload: KubernetesWorkloadStatus): SourceStatus {
  if (workload.progressing) {
    return "progressing"
  }

  return workload.readyReplicas === workload.desiredReplicas ? "ok" : "stale"
}
