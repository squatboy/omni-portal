"use client"

import * as React from "react"
import { AlertTriangle, RefreshCw, Sun, Moon } from "lucide-react"
import { useTheme } from "next-themes"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { api } from "@/lib/api"
import { getMockViewParam, isMockMode, mockUser } from "@/lib/mock"
import type { User } from "@/lib/types"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { AppSidebar, type AppView } from "./app-sidebar"
import { AuthScreen } from "./auth-screen"
import { POLL_INTERVAL_MS, sourceLabels } from "./dashboard/lib/constants"
import type { DashboardSnapshot, DashboardTab } from "./dashboard/lib/types"
import {
  allRuntimeSourcesFailed,
  formatDateTime,
  loadSnapshot,
} from "./dashboard/lib/utils"
import { HealthBadge } from "./dashboard/shared/common"
import { DashboardContent } from "./dashboard/shared/dashboard-content"
import { DashboardSkeleton } from "./dashboard/shared/dashboard-skeleton"
import { ManagePanel, type ManageSection } from "./manage-panel"

const appViews: AppView[] = [
  "overview",
  "health",
  "kubernetes",
  "pods",
  "vms",
  "argocd",
  "gitlab",
  "nexus",
  "manage-vm",
  "manage-integrations",
  "manage-users",
]

const manageViewMap = {
  "manage-vm": "vm",
  "manage-integrations": "integrations",
  "manage-users": "users",
} satisfies Record<string, ManageSection>

function resolveInitialView(mockMode: boolean): AppView {
  if (!mockMode) {
    return "overview"
  }
  const candidate = getMockViewParam()
  if (candidate === "manage") {
    return "manage-vm"
  }
  if (candidate && appViews.includes(candidate as AppView)) {
    return candidate as AppView
  }
  return "overview"
}

function isManageView(view: AppView): view is keyof typeof manageViewMap {
  return view in manageViewMap
}

function getManageSection(view: AppView): ManageSection | null {
  return isManageView(view) ? manageViewMap[view] : null
}

function getHeaderTitle(view: AppView, activeTab: DashboardTab) {
  const manageSection = getManageSection(view)
  if (manageSection) {
    const label = manageSection.charAt(0).toUpperCase() + manageSection.slice(1)
    return `Manage / ${label}`
  }
  if (activeTab === "overview") {
    return "Infrastructure Overview"
  }
  return (
    sourceLabels[activeTab as keyof typeof sourceLabels] ?? "Platform Health"
  )
}

export function OmniDashboard() {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = React.useSyncExternalStore(
    React.useCallback(() => () => {}, []),
    () => true,
    () => false
  )

  const [authLoading, setAuthLoading] = React.useState(true)
  const [setupRequired, setSetupRequired] = React.useState(false)
  const [user, setUser] = React.useState<User | null>(null)
  const [snapshot, setSnapshot] = React.useState<DashboardSnapshot | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = React.useState(false)
  const [activeView, setActiveView] = React.useState<AppView>("overview")
  const [pollKey, setPollKey] = React.useState(0)
  const [lastUiRefreshAt, setLastUiRefreshAt] = React.useState<string | null>(
    null
  )

  const mockMode = React.useMemo(() => {
    if (!mounted) return false
    return isMockMode()
  }, [mounted])

  const refresh = React.useCallback(
    async (force = false) => {
      if (!user) {
        return
      }
      setIsRefreshing(true)
      try {
        const nextSnapshot = await loadSnapshot(force)
        setSnapshot(nextSnapshot)
        setError(
          allRuntimeSourcesFailed(nextSnapshot) ? "All sources failed" : null
        )
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
    },
    [user]
  )

  React.useEffect(() => {
    if (!mounted) return

    const isMock = isMockMode()
    if (isMock) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUser(mockUser)
      setActiveView(resolveInitialView(true))
      setAuthLoading(false)
      return
    }

    void api
      .me()
      .then((me) => {
        setSetupRequired(me.setupRequired)
        setUser(me.authenticated ? me.user : null)
      })
      .catch(() => {
        setUser(null)
      })
      .finally(() => setAuthLoading(false))
  }, [mounted])

  React.useEffect(() => {
    if (!mounted || !user) {
      return
    }
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
  }, [refresh, pollKey, user, mounted])

  if (!mounted || authLoading) {
    return <DashboardSkeleton />
  }

  if (!user) {
    return (
      <AuthScreen
        setupRequired={setupRequired}
        onAuthenticated={(nextUser) => {
          setUser(nextUser)
          setSetupRequired(false)
        }}
      />
    )
  }

  const canManage = user.role === "admin"
  const manageSection = getManageSection(activeView)
  const activeTab: DashboardTab = isManageView(activeView)
    ? "overview"
    : activeView

  return (
    <SidebarProvider>
      <AppSidebar
        snapshot={snapshot}
        activeView={activeView}
        onViewChange={setActiveView}
        lastUiRefreshAt={lastUiRefreshAt}
        canManage={canManage}
      />
      <SidebarInset>
        <header className="sticky top-0 flex h-14 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur md:px-6">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="flex flex-1 items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold">
                {getHeaderTitle(activeView, activeTab)}
              </h1>
              <p className="truncate text-[10px] text-muted-foreground">
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
                  {error === "All sources failed" ? error : "Poll failed"}
                </Badge>
              ) : null}
              <HealthBadge health={snapshot?.overview.data.health} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void api
                    .logout()
                    .finally(() => setUser(mockMode ? mockUser : null))
                }}
              >
                Logout
              </Button>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="Toggle theme"
                      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                    >
                      {!mounted ? (
                        <Sun data-icon="inline-start" className="h-[1.2rem] w-[1.2rem]" />
                      ) : resolvedTheme === "dark" ? (
                        <Sun data-icon="inline-start" className="h-[1.2rem] w-[1.2rem]" />
                      ) : (
                        <Moon data-icon="inline-start" className="h-[1.2rem] w-[1.2rem]" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Change theme</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
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
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Refresh collection</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </header>

        <div className="flex flex-col gap-4 p-4 md:p-6">
          {manageSection ? (
            <ManagePanel section={manageSection} />
          ) : snapshot ? (
            <DashboardContent
              snapshot={snapshot}
              activeTab={activeTab}
              onTabChange={(tab) => {
                setActiveView(tab)
              }}
            />
          ) : (
            <DashboardSkeleton />
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
