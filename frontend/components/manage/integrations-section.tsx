"use client"

import * as React from "react"
import { type ColumnDef } from "@tanstack/react-table"

import { api, type TestResult } from "@/lib/api"
import type {
  ArgoCDIntegration,
  GitHubIntegration,
  GitLabIntegration,
  KubernetesIntegration,
  NexusIntegration,
} from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DataTable } from "@/components/ui/data-table"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronUp, Plus } from "lucide-react"
import {
  ActiveToggle,
  FormActions,
  parseProjects,
  parseRepositories,
  RowActions,
  SecretInput,
  showMessage,
  splitList,
  TextInput,
} from "./shared"

// ─── Empty defaults ────────────────────────────────────────────────────────────

const emptyKubernetes: KubernetesIntegration & { token: string } = {
  id: "",
  name: "",
  apiUrl: "",
  namespaces: [],
  active: true,
  tokenConfigured: false,
  token: "",
}

const emptyArgoCD: ArgoCDIntegration & { token: string } = {
  id: "",
  name: "",
  baseUrl: "",
  active: true,
  tokenConfigured: false,
  token: "",
}

const emptyGitLab: GitLabIntegration & { token: string; projectsText: string; branchText: string } =
{
  id: "",
  name: "",
  baseUrl: "",
  projects: [],
  active: true,
  tokenConfigured: false,
  token: "",
  projectsText: "",
  branchText: "",
}

const emptyGitHub: GitHubIntegration & {
  token: string
  repositoriesText: string
  branchText: string
} = {
  id: "",
  name: "",
  baseUrl: "https://github.com",
  repositories: [],
  active: true,
  tokenConfigured: false,
  token: "",
  repositoriesText: "",
  branchText: "",
}

const emptyNexus: NexusIntegration = {
  id: "",
  name: "",
  url: "",
  active: true,
}

// ─── Per-integration form components (Phase 2 dedup) ──────────────────────────

function KubernetesForm({
  value,
  onChange,
  onSubmit,
  onTest,
  activeId = "kubernetes-active",
}: {
  value: KubernetesIntegration & { token: string }
  onChange: (v: KubernetesIntegration & { token: string }) => void
  onSubmit: () => void
  onTest: () => Promise<TestResult>
  activeId?: string
}) {
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <TextInput
        label="Name"
        value={value.name}
        onChange={(name) => onChange({ ...value, name })}
        required
      />
      <TextInput
        label="API URL"
        value={value.apiUrl}
        onChange={(apiUrl) => onChange({ ...value, apiUrl })}
        placeholder="https://api.k8s.example.com"
        required
      />
      <TextInput
        label="Namespaces"
        value={value.namespaces.join(",")}
        onChange={(v) => onChange({ ...value, namespaces: splitList(v) })}
        placeholder="default,kube-system"
      />
      <SecretInput
        configured={value.tokenConfigured}
        value={value.token}
        onChange={(token) => onChange({ ...value, token })}
      />
      <ActiveToggle
        id={activeId}
        checked={value.active}
        onChange={(active) => onChange({ ...value, active })}
      />
      <FormActions onTest={onTest} />
    </form>
  )
}

function ArgoCDForm({
  value,
  onChange,
  onSubmit,
  onTest,
  activeId = "argocd-active",
}: {
  value: ArgoCDIntegration & { token: string }
  onChange: (v: ArgoCDIntegration & { token: string }) => void
  onSubmit: () => void
  onTest: () => Promise<TestResult>
  activeId?: string
}) {
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <TextInput
        label="Name"
        value={value.name}
        onChange={(name) => onChange({ ...value, name })}
        required
      />
      <TextInput
        label="Base URL"
        value={value.baseUrl}
        onChange={(baseUrl) => onChange({ ...value, baseUrl })}
        placeholder="https://argocd.example.com"
        required
      />
      <SecretInput
        configured={value.tokenConfigured}
        value={value.token}
        onChange={(token) => onChange({ ...value, token })}
      />
      <ActiveToggle
        id={activeId}
        checked={value.active}
        onChange={(active) => onChange({ ...value, active })}
      />
      <FormActions onTest={onTest} />
    </form>
  )
}

function GitLabForm({
  value,
  onChange,
  onSubmit,
  onTest,
  activeId = "gitlab-active",
}: {
  value: GitLabIntegration & { token: string; projectsText: string; branchText: string }
  onChange: (
    v: GitLabIntegration & { token: string; projectsText: string; branchText: string }
  ) => void
  onSubmit: () => void
  onTest: () => Promise<TestResult>
  activeId?: string
}) {
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <TextInput
        label="Name"
        value={value.name}
        onChange={(name) => onChange({ ...value, name })}
        required
      />
      <TextInput
        label="Base URL"
        value={value.baseUrl}
        onChange={(baseUrl) => onChange({ ...value, baseUrl })}
        placeholder="https://gitlab.example.com"
        required
      />
      <div className="grid grid-cols-2 gap-3">
        <TextInput
          label="Projects"
          value={value.projectsText}
          onChange={(projectsText) => onChange({ ...value, projectsText })}
          placeholder="my-group/example-project"
          required
        />
        <TextInput
          label="Branch"
          value={value.branchText}
          onChange={(branchText) => onChange({ ...value, branchText })}
          placeholder="main"
        />
      </div>
      <SecretInput
        configured={value.tokenConfigured}
        value={value.token}
        onChange={(token) => onChange({ ...value, token })}
      />
      <ActiveToggle
        id={activeId}
        checked={value.active}
        onChange={(active) => onChange({ ...value, active })}
      />
      <FormActions onTest={onTest} />
    </form>
  )
}

function GitHubForm({
  value,
  onChange,
  onSubmit,
  onTest,
  activeId = "github-active",
}: {
  value: GitHubIntegration & { token: string; repositoriesText: string; branchText: string }
  onChange: (
    v: GitHubIntegration & { token: string; repositoriesText: string; branchText: string }
  ) => void
  onSubmit: () => void
  onTest: () => Promise<TestResult>
  activeId?: string
}) {
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <TextInput
        label="Name"
        value={value.name}
        onChange={(name) => onChange({ ...value, name })}
        required
      />
      <TextInput
        label="Base URL"
        value={value.baseUrl}
        onChange={(baseUrl) => onChange({ ...value, baseUrl })}
        placeholder="https://github.com"
        required
      />
      <div className="grid grid-cols-2 gap-3">
        <TextInput
          label="Repositories"
          value={value.repositoriesText}
          onChange={(repositoriesText) =>
            onChange({ ...value, repositoriesText })
          }
          placeholder="user/example-repo"
          required
        />
        <TextInput
          label="Branch"
          value={value.branchText}
          onChange={(branchText) => onChange({ ...value, branchText })}
          placeholder="main"
        />
      </div>
      <SecretInput
        configured={value.tokenConfigured}
        value={value.token}
        onChange={(token) => onChange({ ...value, token })}
      />
      <ActiveToggle
        id={activeId}
        checked={value.active}
        onChange={(active) => onChange({ ...value, active })}
      />
      <FormActions onTest={onTest} />
    </form>
  )
}

function NexusForm({
  value,
  onChange,
  onSubmit,
  onTest,
  activeId = "nexus-active",
}: {
  value: NexusIntegration
  onChange: (v: NexusIntegration) => void
  onSubmit: () => void
  onTest: () => Promise<TestResult>
  activeId?: string
}) {
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <TextInput
        label="Name"
        value={value.name}
        onChange={(name) => onChange({ ...value, name })}
        required
      />
      <TextInput
        label="URL"
        value={value.url}
        onChange={(url) => onChange({ ...value, url })}
        placeholder="https://nexus.example.com"
        required
      />
      <ActiveToggle
        id={activeId}
        checked={value.active}
        onChange={(active) => onChange({ ...value, active })}
      />
      <FormActions onTest={onTest} />
    </form>
  )
}

// ─── Shared list + card ────────────────────────────────────────────────────────

function CollapsibleFormSection({
  title = "Add Integration",
  children,
}: {
  title?: string
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = React.useState(false)

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="border rounded-lg p-3 bg-muted/40"
    >
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex w-full items-center justify-between font-semibold text-xs text-muted-foreground p-1 h-auto hover:bg-transparent"
        >
          <span className="flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            {title}
          </span>
          {isOpen ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3 animate-slide-down">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}

function IntegrationCard({
  title,
  icon,
  configured,
  children,
}: {
  title: string
  icon?: string
  configured: number
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            {icon && (
              <img
                src={icon}
                alt={`${title} icon`}
                className="h-5 w-5 object-contain"
              />
            )}
            <span>{title}</span>
          </span>
          <Badge variant="outline">{configured} configured</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  )
}

function IntegrationList<
  T extends {
    id: string
    name: string
    active: boolean
    apiUrl?: string
    baseUrl?: string
    url?: string
  },
>({
  items,
  onEdit,
  onDelete,
  editingId,
  renderEditForm,
}: {
  items: T[]
  onEdit: (item: T) => void
  onDelete?: (id: string) => void
  editingId?: string | null
  renderEditForm?: (item: T) => React.ReactNode
}) {
  const columns = React.useMemo<ColumnDef<T>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <div className="font-medium">{row.original.name}</div>
        ),
      },
      {
        accessorKey: "url",
        header: "URL",
        cell: ({ row }) => {
          const item = row.original
          const displayUrl = item.apiUrl ?? item.baseUrl ?? item.url
          return (
            <div className="font-mono text-xs text-muted-foreground">
              {displayUrl ?? "-"}
            </div>
          )
        },
      },
      {
        accessorKey: "active",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.active ? "secondary" : "outline"}>
            {row.original.active ? "active" : "inactive"}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: () => <div className="text-right">Actions</div>,
        cell: ({ row }) => {
          const item = row.original
          return (
            <div className="flex justify-end gap-2">
              <RowActions
                onEdit={() => onEdit(item)}
                onDelete={() => onDelete?.(item.id)}
                deleteConfirmTitle={`Delete ${item.name}`}
              />
            </div>
          )
        },
      },
    ],
    [editingId, onEdit, onDelete]
  )

  return (
    <DataTable
      columns={columns}
      data={items}
      getRowId={(row) => row.id}
      expandedId={editingId}
      renderSubComponent={(item) => (
        <div className="animate-slide-down">{renderEditForm?.(item)}</div>
      )}
    />
  )
}

// ─── Main section component ────────────────────────────────────────────────────

export function IntegrationsSection() {
  const [kubernetes, setKubernetes] = React.useState<KubernetesIntegration[]>(
    []
  )
  const [argocd, setArgoCD] = React.useState<ArgoCDIntegration[]>([])
  const [gitlab, setGitLab] = React.useState<GitLabIntegration[]>([])
  const [github, setGitHub] = React.useState<GitHubIntegration[]>([])
  const [nexus, setNexus] = React.useState<NexusIntegration[]>([])

  const [kubernetesForm, setKubernetesForm] = React.useState<
    KubernetesIntegration & { token: string }
  >(emptyKubernetes)
  const [argocdForm, setArgoCDForm] = React.useState<
    ArgoCDIntegration & { token: string }
  >(emptyArgoCD)
  const [gitlabForm, setGitLabForm] = React.useState<
    GitLabIntegration & { token: string; projectsText: string; branchText: string }
  >(emptyGitLab)
  const [githubForm, setGitHubForm] = React.useState<
    GitHubIntegration & { token: string; repositoriesText: string; branchText: string }
  >(emptyGitHub)
  const [nexusForm, setNexusForm] = React.useState<NexusIntegration>(emptyNexus)

  const [editingKubernetesId, setEditingKubernetesId] = React.useState<
    string | null
  >(null)
  const [editKubernetesForm, setEditKubernetesForm] = React.useState<
    KubernetesIntegration & { token: string }
  >(emptyKubernetes)

  const [editingArgoCDId, setEditingArgoCDId] = React.useState<string | null>(
    null
  )
  const [editArgoCDForm, setEditArgoCDForm] = React.useState<
    ArgoCDIntegration & { token: string }
  >(emptyArgoCD)

  const [editingGitLabId, setEditingGitLabId] = React.useState<string | null>(
    null
  )
  const [editGitLabForm, setEditGitLabForm] = React.useState<
    GitLabIntegration & { token: string; projectsText: string; branchText: string }
  >(emptyGitLab)

  const [editingGitHubId, setEditingGitHubId] = React.useState<string | null>(
    null
  )
  const [editGitHubForm, setEditGitHubForm] = React.useState<
    GitHubIntegration & { token: string; repositoriesText: string; branchText: string }
  >(emptyGitHub)

  const [editingNexusId, setEditingNexusId] = React.useState<string | null>(
    null
  )
  const [editNexusForm, setEditNexusForm] =
    React.useState<NexusIntegration>(emptyNexus)

  const loadKubernetes = React.useCallback(async () => {
    const next = await api.listKubernetes()
    setKubernetes(next ?? [])
  }, [])
  const loadArgoCD = React.useCallback(async () => {
    const next = await api.listArgoCD()
    setArgoCD(next ?? [])
  }, [])
  const loadGitLab = React.useCallback(async () => {
    const next = await api.listGitLab()
    setGitLab(next ?? [])
  }, [])
  const loadGitHub = React.useCallback(async () => {
    const next = await api.listGitHub()
    setGitHub(next ?? [])
  }, [])
  const loadNexus = React.useCallback(async () => {
    const next = await api.listNexus()
    setNexus(next ?? [])
  }, [])

  React.useEffect(() => {
    const id = window.setTimeout(() => {
      void Promise.all([
        loadKubernetes(),
        loadArgoCD(),
        loadGitLab(),
        loadGitHub(),
        loadNexus(),
      ])
    }, 0)
    return () => window.clearTimeout(id)
  }, [loadKubernetes, loadArgoCD, loadGitLab, loadGitHub, loadNexus])

  async function saveKubernetes(
    form: KubernetesIntegration & { token: string },
    isEdit = false
  ) {
    await api.saveKubernetes(form)
    if (!isEdit) setKubernetesForm(emptyKubernetes)
    showMessage("Kubernetes integration saved.")
    await loadKubernetes()
  }

  async function saveArgoCD(
    form: ArgoCDIntegration & { token: string },
    isEdit = false
  ) {
    await api.saveArgoCD(form)
    if (!isEdit) setArgoCDForm(emptyArgoCD)
    showMessage("ArgoCD integration saved.")
    await loadArgoCD()
  }

  async function saveGitLab(
    form: GitLabIntegration & { token: string; projectsText: string; branchText: string },
    isEdit = false
  ) {
    await api.saveGitLab({
      ...form,
      projects: parseProjects(form.projectsText, form.branchText),
    })
    if (!isEdit) setGitLabForm(emptyGitLab)
    showMessage("GitLab integration saved.")
    await loadGitLab()
  }

  async function saveGitHub(
    form: GitHubIntegration & { token: string; repositoriesText: string; branchText: string },
    isEdit = false
  ) {
    await api.saveGitHub({
      ...form,
      repositories: parseRepositories(form.repositoriesText, form.branchText),
    })
    if (!isEdit) setGitHubForm(emptyGitHub)
    showMessage("GitHub integration saved.")
    await loadGitHub()
  }

  async function saveNexus(form: NexusIntegration, isEdit = false) {
    await api.saveNexus(form)
    if (!isEdit) setNexusForm(emptyNexus)
    showMessage("Nexus integration saved.")
    await loadNexus()
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <IntegrationCard title="Kubernetes" icon="/kubernetes.svg" configured={kubernetes.length}>
        <CollapsibleFormSection title="Add Kubernetes Integration">
          <KubernetesForm
            value={kubernetesForm}
            onChange={setKubernetesForm}
            onSubmit={() =>
              void saveKubernetes(kubernetesForm, false).catch((e) =>
                showMessage(e.message)
              )
            }
            onTest={() => api.testKubernetes(kubernetesForm)}
          />
        </CollapsibleFormSection>
        <IntegrationList
          items={kubernetes}
          editingId={editingKubernetesId}
          onEdit={(item) => {
            if (editingKubernetesId === item.id) {
              setEditingKubernetesId(null)
              setEditKubernetesForm(emptyKubernetes)
            } else {
              setEditingKubernetesId(item.id)
              setEditKubernetesForm({ ...item, token: "" })
            }
          }}
          onDelete={(id) =>
            void api
              .deleteKubernetes(id)
              .then(loadKubernetes)
              .catch((e) => showMessage(e.message))
          }
          renderEditForm={(item) => (
            <KubernetesForm
              value={editKubernetesForm}
              onChange={setEditKubernetesForm}
              onSubmit={() =>
                void saveKubernetes(editKubernetesForm, true)
                  .then(() => setEditingKubernetesId(null))
                  .catch((e) => showMessage(e.message))
              }
              onTest={() => api.testKubernetes(editKubernetesForm)}
              activeId={`kubernetes-active-${item.id}`}
            />
          )}
        />
      </IntegrationCard>

      <IntegrationCard title="ArgoCD" icon="/argo-cd.svg" configured={argocd.length}>
        <CollapsibleFormSection title="Add ArgoCD Integration">
          <ArgoCDForm
            value={argocdForm}
            onChange={setArgoCDForm}
            onSubmit={() =>
              void saveArgoCD(argocdForm, false).catch((e) =>
                showMessage(e.message)
              )
            }
            onTest={() => api.testArgoCD(argocdForm)}
          />
        </CollapsibleFormSection>
        <IntegrationList
          items={argocd}
          editingId={editingArgoCDId}
          onEdit={(item) => {
            if (editingArgoCDId === item.id) {
              setEditingArgoCDId(null)
              setEditArgoCDForm(emptyArgoCD)
            } else {
              setEditingArgoCDId(item.id)
              setEditArgoCDForm({ ...item, token: "" })
            }
          }}
          onDelete={(id) =>
            void api
              .deleteArgoCD(id)
              .then(loadArgoCD)
              .catch((e) => showMessage(e.message))
          }
          renderEditForm={(item) => (
            <ArgoCDForm
              value={editArgoCDForm}
              onChange={setEditArgoCDForm}
              onSubmit={() =>
                void saveArgoCD(editArgoCDForm, true)
                  .then(() => setEditingArgoCDId(null))
                  .catch((e) => showMessage(e.message))
              }
              onTest={() => api.testArgoCD(editArgoCDForm)}
              activeId={`argocd-active-${item.id}`}
            />
          )}
        />
      </IntegrationCard>

      <IntegrationCard title="GitLab" icon="/gitlab.svg" configured={gitlab.length}>
        <CollapsibleFormSection title="Add GitLab Integration">
          <GitLabForm
            value={gitlabForm}
            onChange={setGitLabForm}
            onSubmit={() =>
              void saveGitLab(gitlabForm, false).catch((e) =>
                showMessage(e.message)
              )
            }
            onTest={() =>
              api.testGitLab({
                ...gitlabForm,
                projects: parseProjects(gitlabForm.projectsText, gitlabForm.branchText),
              })
            }
          />
        </CollapsibleFormSection>
        <IntegrationList
          items={gitlab}
          editingId={editingGitLabId}
          onEdit={(item) => {
            if (editingGitLabId === item.id) {
              setEditingGitLabId(null)
              setEditGitLabForm(emptyGitLab)
            } else {
              setEditingGitLabId(item.id)
              setEditGitLabForm({
                ...item,
                token: "",
                projectsText: (item.projects ?? []).map((p) => p.path).join("\n"),
                branchText: (item.projects ?? []).map((p) => p.defaultBranch).join("\n"),
              })
            }
          }}
          onDelete={(id) =>
            void api
              .deleteGitLab(id)
              .then(loadGitLab)
              .catch((e) => showMessage(e.message))
          }
          renderEditForm={(item) => (
            <GitLabForm
              value={editGitLabForm}
              onChange={setEditGitLabForm}
              onSubmit={() =>
                void saveGitLab(editGitLabForm, true)
                  .then(() => setEditingGitLabId(null))
                  .catch((e) => showMessage(e.message))
              }
              onTest={() =>
                api.testGitLab({
                  ...editGitLabForm,
                  projects: parseProjects(editGitLabForm.projectsText, editGitLabForm.branchText),
                })
              }
              activeId={`gitlab-active-${item.id}`}
            />
          )}
        />
      </IntegrationCard>

      <IntegrationCard title="GitHub" icon="/github.svg" configured={github.length}>
        <CollapsibleFormSection title="Add GitHub Integration">
          <GitHubForm
            value={githubForm}
            onChange={setGitHubForm}
            onSubmit={() =>
              void saveGitHub(githubForm, false).catch((e) =>
                showMessage(e.message)
              )
            }
            onTest={() =>
              api.testGitHub({
                ...githubForm,
                repositories: parseRepositories(githubForm.repositoriesText, githubForm.branchText),
              })
            }
          />
        </CollapsibleFormSection>
        <IntegrationList
          items={github}
          editingId={editingGitHubId}
          onEdit={(item) => {
            if (editingGitHubId === item.id) {
              setEditingGitHubId(null)
              setEditGitHubForm(emptyGitHub)
            } else {
              setEditingGitHubId(item.id)
              setEditGitHubForm({
                ...item,
                token: "",
                repositoriesText: (item.repositories ?? []).map((repository) => repository.fullName).join("\n"),
                branchText: (item.repositories ?? []).map((repository) => repository.defaultBranch).join("\n"),
              })
            }
          }}
          onDelete={(id) =>
            void api
              .deleteGitHub(id)
              .then(loadGitHub)
              .catch((e) => showMessage(e.message))
          }
          renderEditForm={(item) => (
            <GitHubForm
              value={editGitHubForm}
              onChange={setEditGitHubForm}
              onSubmit={() =>
                void saveGitHub(editGitHubForm, true)
                  .then(() => setEditingGitHubId(null))
                  .catch((e) => showMessage(e.message))
              }
              onTest={() =>
                api.testGitHub({
                  ...editGitHubForm,
                  repositories: parseRepositories(
                    editGitHubForm.repositoriesText,
                    editGitHubForm.branchText
                  ),
                })
              }
              activeId={`github-active-${item.id}`}
            />
          )}
        />
      </IntegrationCard>

      <IntegrationCard title="Nexus" icon="/nexus.svg" configured={nexus.length}>
        <CollapsibleFormSection title="Add Nexus Integration">
          <NexusForm
            value={nexusForm}
            onChange={setNexusForm}
            onSubmit={() =>
              void saveNexus(nexusForm, false).catch((e) =>
                showMessage(e.message)
              )
            }
            onTest={() => api.testNexus(nexusForm)}
          />
        </CollapsibleFormSection>
        <IntegrationList
          items={nexus}
          editingId={editingNexusId}
          onEdit={(item) => {
            if (editingNexusId === item.id) {
              setEditingNexusId(null)
              setEditNexusForm(emptyNexus)
            } else {
              setEditingNexusId(item.id)
              setEditNexusForm(item)
            }
          }}
          onDelete={(id) =>
            void api
              .deleteNexus(id)
              .then(loadNexus)
              .catch((e) => showMessage(e.message))
          }
          renderEditForm={(item) => (
            <NexusForm
              value={editNexusForm}
              onChange={setEditNexusForm}
              onSubmit={() =>
                void saveNexus(editNexusForm, true)
                  .then(() => setEditingNexusId(null))
                  .catch((e) => showMessage(e.message))
              }
              onTest={() => api.testNexus(editNexusForm)}
              activeId={`nexus-active-${item.id}`}
            />
          )}
        />
      </IntegrationCard>
    </div>
  )
}
