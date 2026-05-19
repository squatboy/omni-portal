"use client"

import * as React from "react"
import {
  Activity,
  AlertTriangle,
  HeartPulse,
  LayoutDashboard,
  RefreshCw,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import {
  POLL_INTERVAL_MS,
  sourceIcons,
  sourceLabels,
  sourceOrder,
} from "./dashboard/lib/constants"
import type { DashboardSnapshot, DashboardTab } from "./dashboard/lib/types"
import { formatDateTime, formatTime, loadSnapshot } from "./dashboard/lib/utils"
import { HealthBadge } from "./dashboard/shared/common"
import { DashboardContent } from "./dashboard/shared/dashboard-content"
import { DashboardSkeleton } from "./dashboard/shared/dashboard-skeleton"
import { SidebarItem } from "./dashboard/shared/sidebar-item"

export function OmniDashboard() {
  const [snapshot, setSnapshot] = React.useState<DashboardSnapshot | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState<DashboardTab>("overview")
  const [pollKey, setPollKey] = React.useState(0)
  const [lastUiRefreshAt, setLastUiRefreshAt] = React.useState<string | null>(
    null
  )

  const refresh = React.useCallback(async (force = false) => {
    setIsRefreshing(true)
    try {
      const nextSnapshot = await loadSnapshot(force)
      setSnapshot(nextSnapshot)
      setError(null)
      setLastUiRefreshAt(new Date().toISOString())
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Collect API polling failed."
      )
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  React.useEffect(() => {
    const initialId = window.setTimeout(() => {
      void refresh(false)
    }, 0)

    const intervalId = window.setInterval(() => {
      void refresh(false)
    }, POLL_INTERVAL_MS)

    return () => {
      window.clearTimeout(initialId)
      window.clearInterval(intervalId)
    }
  }, [refresh, pollKey])

  const sources = snapshot?.overview.data.sources ?? []

  return (
    <main className="min-h-svh bg-background text-foreground">
      <aside className="border-b bg-card/80 backdrop-blur lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:border-r lg:border-b-0">
        <div className="flex h-full flex-col gap-4 p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Activity className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">Omni</div>
              <div className="truncate text-xs text-muted-foreground">
                Infra control surface
              </div>
            </div>
          </div>

          <Separator />

          <nav className="flex flex-col gap-1">
            <SidebarItem
              icon={LayoutDashboard}
              label="Overview"
              active={activeTab === "overview"}
              onClick={() => setActiveTab("overview")}
            />
            <SidebarItem
              icon={HeartPulse}
              label="Platform Health"
              active={activeTab === "health"}
              onClick={() => setActiveTab("health")}
            />
            {sourceOrder.map((source) => {
              const summary = sources.find((item) => item.source === source)
              const Icon = sourceIcons[source]

              return (
                <SidebarItem
                  key={source}
                  icon={Icon}
                  label={sourceLabels[source]}
                  active={activeTab === source}
                  status={summary?.status ?? "unknown"}
                  stale={summary?.stale ?? false}
                  onClick={() => setActiveTab(source)}
                />
              )
            })}
          </nav>

          <div className="mt-auto flex flex-col gap-2 rounded-md border bg-background/60 p-3 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">UI refresh</span>
              <span className="font-mono">
                {lastUiRefreshAt ? formatTime(lastUiRefreshAt) : "--:--:--"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Interval</span>
              <span className="font-mono">30s</span>
            </div>
          </div>
        </div>
      </aside>

      <section className="min-w-0 lg:pl-64">
        <header className="sticky top-0 border-b bg-background/95 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold">
                Infrastructure Overview
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                Last collect{" "}
                {snapshot
                  ? formatDateTime(snapshot.overview.data.generatedAt)
                  : "loading"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {error ? (
                <Badge variant="destructive">
                  <AlertTriangle data-icon="inline-start" />
                  Poll failed
                </Badge>
              ) : null}
              <HealthBadge health={snapshot?.overview.data.health} />
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Refresh collect snapshot"
                disabled={isRefreshing}
                onClick={() => {
                  void refresh(true)
                  setPollKey((prev) => prev + 1)
                }}
              >
                <RefreshCw
                  data-icon="inline-start"
                  className={cn(isRefreshing && "animate-spin")}
                />
              </Button>
            </div>
          </div>
        </header>

        <div className="flex flex-col gap-4 p-4 md:p-6">
          {snapshot ? (
            <DashboardContent
              snapshot={snapshot}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          ) : (
            <DashboardSkeleton />
          )}
        </div>
      </section>
    </main>
  )
}
