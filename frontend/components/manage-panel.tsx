"use client"

import { IntegrationsSection } from "./manage/integrations-section"
import { VMSection } from "./manage/vm-section"
import { UsersSection } from "./manage/users-section"

export { parseProjects, parseRepositories } from "./manage/shared"

export type ManageSection = "vm" | "integrations" | "users"

export function ManagePanel({ section }: { section: ManageSection }) {
  return (
    <div className="flex flex-col gap-4">
      {section === "vm" ? <VMSection /> : null}
      {section === "integrations" ? <IntegrationsSection /> : null}
      {section === "users" ? <UsersSection /> : null}
    </div>
  )
}
