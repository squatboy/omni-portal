"use client"

import * as React from "react"
import {
  Check,
  Eye,
  EyeOff,
  Loader2,
  TestTube2,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { api, type TestResult } from "@/lib/api"
import type {
  ArgoCDIntegration,
  GitLabIntegration,
  KubernetesIntegration,
  NexusIntegration,
  User,
  VMResource,
} from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const emptyVM: VMResource = {
  id: "",
  name: "",
  address: "",
  description: "",
  active: true,
}

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

const emptyGitLab: GitLabIntegration & { token: string; projectsText: string } =
{
  id: "",
  name: "",
  baseUrl: "",
  projects: [],
  active: true,
  tokenConfigured: false,
  token: "",
  projectsText: "",
}

const emptyNexus: NexusIntegration = {
  id: "",
  name: "",
  url: "",
  active: true,
}

export type ManageSection = "vm" | "integrations" | "users"

export function ManagePanel({ section }: { section: ManageSection }) {
  const [vms, setVMs] = React.useState<VMResource[]>([])
  const [kubernetes, setKubernetes] = React.useState<KubernetesIntegration[]>(
    []
  )
  const [argocd, setArgoCD] = React.useState<ArgoCDIntegration[]>([])
  const [gitlab, setGitLab] = React.useState<GitLabIntegration[]>([])
  const [nexus, setNexus] = React.useState<NexusIntegration[]>([])
  const [users, setUsers] = React.useState<User[]>([])

  const setMessage = React.useCallback((msg: string | null) => {
    if (!msg) return

    const isError =
      msg.toLowerCase().includes("fail") ||
      msg.toLowerCase().includes("error") ||
      msg.toLowerCase().includes("invalid") ||
      msg.toLowerCase().includes("not found")

    if (isError) {
      toast.error(msg)
    } else {
      toast.success(msg)
    }
  }, [])
  const [vmForm, setVMForm] = React.useState<VMResource>(emptyVM)
  const [kubernetesForm, setKubernetesForm] = React.useState<
    KubernetesIntegration & { token: string }
  >(emptyKubernetes)
  const [argocdForm, setArgoCDForm] = React.useState<
    ArgoCDIntegration & { token: string }
  >(emptyArgoCD)
  const [gitlabForm, setGitLabForm] = React.useState<
    GitLabIntegration & { token: string; projectsText: string }
  >(emptyGitLab)
  const [nexusForm, setNexusForm] = React.useState<NexusIntegration>(emptyNexus)
  const [userForm, setUserForm] = React.useState({
    username: "",
    role: "viewer" as "admin" | "viewer",
    password: "",
    mustChangePassword: true,
  })

  const [editingKubernetesId, setEditingKubernetesId] = React.useState<string | null>(null)
  const [editKubernetesForm, setEditKubernetesForm] = React.useState<
    KubernetesIntegration & { token: string }
  >(emptyKubernetes)

  const [editingArgoCDId, setEditingArgoCDId] = React.useState<string | null>(null)
  const [editArgoCDForm, setEditArgoCDForm] = React.useState<
    ArgoCDIntegration & { token: string }
  >(emptyArgoCD)

  const [editingGitLabId, setEditingGitLabId] = React.useState<string | null>(null)
  const [editGitLabForm, setEditGitLabForm] = React.useState<
    GitLabIntegration & { token: string; projectsText: string }
  >(emptyGitLab)

  const [editingNexusId, setEditingNexusId] = React.useState<string | null>(null)
  const [editNexusForm, setEditNexusForm] = React.useState<NexusIntegration>(emptyNexus)

  const loadVMs = React.useCallback(async () => {
    const nextVMs = await api.listVMs()
    setVMs(nextVMs ?? [])
  }, [])

  const loadKubernetes = React.useCallback(async () => {
    const nextKubernetes = await api.listKubernetes()
    setKubernetes(nextKubernetes ?? [])
  }, [])

  const loadArgoCD = React.useCallback(async () => {
    const nextArgoCD = await api.listArgoCD()
    setArgoCD(nextArgoCD ?? [])
  }, [])

  const loadGitLab = React.useCallback(async () => {
    const nextGitLab = await api.listGitLab()
    setGitLab(nextGitLab ?? [])
  }, [])

  const loadNexus = React.useCallback(async () => {
    const nextNexus = await api.listNexus()
    setNexus(nextNexus ?? [])
  }, [])

  const loadUsers = React.useCallback(async () => {
    const nextUsers = await api.listUsers()
    setUsers(nextUsers ?? [])
  }, [])

  const load = React.useCallback(async () => {
    await Promise.all([
      loadVMs(),
      loadKubernetes(),
      loadArgoCD(),
      loadGitLab(),
      loadNexus(),
      loadUsers(),
    ])
  }, [loadVMs, loadKubernetes, loadArgoCD, loadGitLab, loadNexus, loadUsers])

  React.useEffect(() => {
    const id = window.setTimeout(() => {
      void load()
    }, 0)

    return () => window.clearTimeout(id)
  }, [load])

  async function saveVM() {
    await api.saveVM(vmForm)
    setVMForm(emptyVM)
    setMessage("VM saved.")
    await loadVMs()
  }

  async function saveKubernetes(form: KubernetesIntegration & { token: string }, isEdit = false) {
    await api.saveKubernetes(form)
    if (!isEdit) {
      setKubernetesForm(emptyKubernetes)
    }
    setMessage("Kubernetes integration saved.")
    await loadKubernetes()
  }

  async function saveArgoCD(form: ArgoCDIntegration & { token: string }, isEdit = false) {
    await api.saveArgoCD(form)
    if (!isEdit) {
      setArgoCDForm(emptyArgoCD)
    }
    setMessage("ArgoCD integration saved.")
    await loadArgoCD()
  }

  async function saveGitLab(form: GitLabIntegration & { token: string; projectsText: string }, isEdit = false) {
    await api.saveGitLab({
      ...form,
      projects: parseProjects(form.projectsText),
    })
    if (!isEdit) {
      setGitLabForm(emptyGitLab)
    }
    setMessage("GitLab integration saved.")
    await loadGitLab()
  }

  async function saveNexus(form: NexusIntegration, isEdit = false) {
    await api.saveNexus(form)
    if (!isEdit) {
      setNexusForm(emptyNexus)
    }
    setMessage("Nexus integration saved.")
    await loadNexus()
  }

  async function createUser() {
    await api.createUser(userForm)
    setUserForm({
      username: "",
      role: "viewer",
      password: "",
      mustChangePassword: true,
    })
    setMessage("User created.")
    await loadUsers()
  }

  return (
    <div className="flex flex-col gap-4">
      {section === "vm" ? (
        <Card>
          <CardHeader>
            <CardTitle>VM Resources</CardTitle>
            <CardDescription>
              Ping targets used by the dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ResourceForm
              value={vmForm}
              onChange={setVMForm}
              onSave={() =>
                void saveVM().catch((error) => setMessage(error.message))
              }
            />
            <ResourceTable
              items={vms}
              onEdit={setVMForm}
              onDelete={(id) =>
                void api
                  .deleteVM(id)
                  .then(loadVMs)
                  .catch((error) => setMessage(error.message))
              }
            />
          </CardContent>
        </Card>
      ) : null}
      {section === "integrations" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <IntegrationCard title="Kubernetes" configured={kubernetes.length}>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                void saveKubernetes(kubernetesForm, false).catch((error) =>
                  setMessage(error.message)
                )
              }}
            >
              <TextInput
                label="Name"
                value={kubernetesForm.name}
                onChange={(name) =>
                  setKubernetesForm((prev) => ({ ...prev, name }))
                }
                required
              />
              <TextInput
                label="API URL"
                value={kubernetesForm.apiUrl}
                onChange={(apiUrl) =>
                  setKubernetesForm((prev) => ({ ...prev, apiUrl }))
                }
                placeholder="https://api.k8s.example.com"
                required
              />
              <TextInput
                label="Namespaces"
                value={kubernetesForm.namespaces.join(",")}
                onChange={(value) =>
                  setKubernetesForm((prev) => ({
                    ...prev,
                    namespaces: splitList(value),
                  }))
                }
                placeholder="default,kube-system"
              />
              <SecretInput
                configured={kubernetesForm.tokenConfigured}
                value={kubernetesForm.token}
                onChange={(token) =>
                  setKubernetesForm((prev) => ({ ...prev, token }))
                }
              />
              <ActiveToggle
                id="kubernetes-active"
                checked={kubernetesForm.active}
                onChange={(active) =>
                  setKubernetesForm((prev) => ({ ...prev, active }))
                }
              />
              <FormActions onTest={() => api.testKubernetes(kubernetesForm)} />
            </form>
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
                  .catch((error) => setMessage(error.message))
              }
              renderEditForm={(item) => (
                <form
                  className="flex flex-col gap-3"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void saveKubernetes(editKubernetesForm, true)
                      .then(() => {
                        setEditingKubernetesId(null)
                      })
                      .catch((error) => setMessage(error.message))
                  }}
                >
                  <TextInput
                    label="Name"
                    value={editKubernetesForm.name}
                    onChange={(name) =>
                      setEditKubernetesForm((prev) => ({ ...prev, name }))
                    }
                    required
                  />
                  <TextInput
                    label="API URL"
                    value={editKubernetesForm.apiUrl}
                    onChange={(apiUrl) =>
                      setEditKubernetesForm((prev) => ({ ...prev, apiUrl }))
                    }
                    placeholder="https://api.k8s.example.com"
                    required
                  />
                  <TextInput
                    label="Namespaces"
                    value={editKubernetesForm.namespaces.join(",")}
                    onChange={(value) =>
                      setEditKubernetesForm((prev) => ({
                        ...prev,
                        namespaces: splitList(value),
                      }))
                    }
                    placeholder="default,kube-system"
                  />
                  <SecretInput
                    configured={editKubernetesForm.tokenConfigured}
                    value={editKubernetesForm.token}
                    onChange={(token) =>
                      setEditKubernetesForm((prev) => ({ ...prev, token }))
                    }
                  />
                  <ActiveToggle
                    id={`kubernetes-active-${item.id}`}
                    checked={editKubernetesForm.active}
                    onChange={(active) =>
                      setEditKubernetesForm((prev) => ({ ...prev, active }))
                    }
                  />
                  <FormActions onTest={() => api.testKubernetes(editKubernetesForm)} />
                </form>
              )}
            />
          </IntegrationCard>
          <IntegrationCard title="ArgoCD" configured={argocd.length}>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                void saveArgoCD(argocdForm, false).catch((error) => setMessage(error.message))
              }}
            >
              <TextInput
                label="Name"
                value={argocdForm.name}
                onChange={(name) =>
                  setArgoCDForm((prev) => ({ ...prev, name }))
                }
                required
              />
              <TextInput
                label="Base URL"
                value={argocdForm.baseUrl}
                onChange={(baseUrl) =>
                  setArgoCDForm((prev) => ({ ...prev, baseUrl }))
                }
                placeholder="https://argocd.example.com"
                required
              />
              <SecretInput
                configured={argocdForm.tokenConfigured}
                value={argocdForm.token}
                onChange={(token) =>
                  setArgoCDForm((prev) => ({ ...prev, token }))
                }
              />
              <ActiveToggle
                id="argocd-active"
                checked={argocdForm.active}
                onChange={(active) =>
                  setArgoCDForm((prev) => ({ ...prev, active }))
                }
              />
              <FormActions onTest={() => api.testArgoCD(argocdForm)} />
            </form>
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
                  .catch((error) => setMessage(error.message))
              }
              renderEditForm={(item) => (
                <form
                  className="flex flex-col gap-3"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void saveArgoCD(editArgoCDForm, true)
                      .then(() => {
                        setEditingArgoCDId(null)
                      })
                      .catch((error) => setMessage(error.message))
                  }}
                >
                  <TextInput
                    label="Name"
                    value={editArgoCDForm.name}
                    onChange={(name) =>
                      setEditArgoCDForm((prev) => ({ ...prev, name }))
                    }
                    required
                  />
                  <TextInput
                    label="Base URL"
                    value={editArgoCDForm.baseUrl}
                    onChange={(baseUrl) =>
                      setEditArgoCDForm((prev) => ({ ...prev, baseUrl }))
                    }
                    placeholder="https://argocd.example.com"
                    required
                  />
                  <SecretInput
                    configured={editArgoCDForm.tokenConfigured}
                    value={editArgoCDForm.token}
                    onChange={(token) =>
                      setEditArgoCDForm((prev) => ({ ...prev, token }))
                    }
                  />
                  <ActiveToggle
                    id={`argocd-active-${item.id}`}
                    checked={editArgoCDForm.active}
                    onChange={(active) =>
                      setEditArgoCDForm((prev) => ({ ...prev, active }))
                    }
                  />
                  <FormActions onTest={() => api.testArgoCD(editArgoCDForm)} />
                </form>
              )}
            />
          </IntegrationCard>
          <IntegrationCard title="GitLab" configured={gitlab.length}>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                void saveGitLab(gitlabForm, false).catch((error) => setMessage(error.message))
              }}
            >
              <TextInput
                label="Name"
                value={gitlabForm.name}
                onChange={(name) =>
                  setGitLabForm((prev) => ({ ...prev, name }))
                }
                required
              />
              <TextInput
                label="Base URL"
                value={gitlabForm.baseUrl}
                onChange={(baseUrl) =>
                  setGitLabForm((prev) => ({ ...prev, baseUrl }))
                }
                placeholder="https://gitlab.example.com"
                required
              />
              <TextInput
                label="Projects"
                value={gitlabForm.projectsText}
                onChange={(projectsText) =>
                  setGitLabForm((prev) => ({ ...prev, projectsText }))
                }
                placeholder="frontend-app|my-group/frontend-app|main"
              />
              <SecretInput
                configured={gitlabForm.tokenConfigured}
                value={gitlabForm.token}
                onChange={(token) =>
                  setGitLabForm((prev) => ({ ...prev, token }))
                }
              />
              <ActiveToggle
                id="gitlab-active"
                checked={gitlabForm.active}
                onChange={(active) =>
                  setGitLabForm((prev) => ({ ...prev, active }))
                }
              />
              <FormActions
                onTest={() =>
                  api.testGitLab({
                    ...gitlabForm,
                    projects: parseProjects(gitlabForm.projectsText),
                  })
                }
              />
            </form>
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
                    projectsText: (item.projects ?? [])
                      .map((project) =>
                        [
                          project.name,
                          project.path,
                          project.defaultBranch,
                          project.link ?? "",
                        ].join("|")
                      )
                      .join("\n"),
                  })
                }
              }}
              onDelete={(id) =>
                void api
                  .deleteGitLab(id)
                  .then(loadGitLab)
                  .catch((error) => setMessage(error.message))
              }
              renderEditForm={(item) => (
                <form
                  className="flex flex-col gap-3"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void saveGitLab(editGitLabForm, true)
                      .then(() => {
                        setEditingGitLabId(null)
                      })
                      .catch((error) => setMessage(error.message))
                  }}
                >
                  <TextInput
                    label="Name"
                    value={editGitLabForm.name}
                    onChange={(name) =>
                      setEditGitLabForm((prev) => ({ ...prev, name }))
                    }
                    required
                  />
                  <TextInput
                    label="Base URL"
                    value={editGitLabForm.baseUrl}
                    onChange={(baseUrl) =>
                      setEditGitLabForm((prev) => ({ ...prev, baseUrl }))
                    }
                    placeholder="https://gitlab.example.com"
                    required
                  />
                  <TextInput
                    label="Projects"
                    value={editGitLabForm.projectsText}
                    onChange={(projectsText) =>
                      setEditGitLabForm((prev) => ({ ...prev, projectsText }))
                    }
                    placeholder="frontend-app|my-group/frontend-app|main"
                  />
                  <SecretInput
                    configured={editGitLabForm.tokenConfigured}
                    value={editGitLabForm.token}
                    onChange={(token) =>
                      setEditGitLabForm((prev) => ({ ...prev, token }))
                    }
                  />
                  <ActiveToggle
                    id={`gitlab-active-${item.id}`}
                    checked={editGitLabForm.active}
                    onChange={(active) =>
                      setEditGitLabForm((prev) => ({ ...prev, active }))
                    }
                  />
                  <FormActions
                    onTest={() =>
                      api.testGitLab({
                        ...editGitLabForm,
                        projects: parseProjects(editGitLabForm.projectsText),
                      })
                    }
                  />
                </form>
              )}
            />
          </IntegrationCard>
          <IntegrationCard title="Nexus" configured={nexus.length}>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                void saveNexus(nexusForm, false).catch((error) => setMessage(error.message))
              }}
            >
              <TextInput
                label="Name"
                value={nexusForm.name}
                onChange={(name) => setNexusForm((prev) => ({ ...prev, name }))}
                required
              />
              <TextInput
                label="URL"
                value={nexusForm.url}
                onChange={(url) => setNexusForm((prev) => ({ ...prev, url }))}
                placeholder="https://nexus.example.com"
                required
              />
              <ActiveToggle
                id="nexus-active"
                checked={nexusForm.active}
                onChange={(active) =>
                  setNexusForm((prev) => ({ ...prev, active }))
                }
              />
              <FormActions onTest={() => api.testNexus(nexusForm)} />
            </form>
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
                  .catch((error) => setMessage(error.message))
              }
              renderEditForm={(item) => (
                <form
                  className="flex flex-col gap-3"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void saveNexus(editNexusForm, true)
                      .then(() => {
                        setEditingNexusId(null)
                      })
                      .catch((error) => setMessage(error.message))
                  }}
                >
                  <TextInput
                    label="Name"
                    value={editNexusForm.name}
                    onChange={(name) =>
                      setEditNexusForm((prev) => ({ ...prev, name }))
                    }
                    required
                  />
                  <TextInput
                    label="URL"
                    value={editNexusForm.url}
                    onChange={(url) =>
                      setEditNexusForm((prev) => ({ ...prev, url }))
                    }
                    placeholder="https://nexus.example.com"
                    required
                  />
                  <ActiveToggle
                    id={`nexus-active-${item.id}`}
                    checked={editNexusForm.active}
                    onChange={(active) =>
                      setEditNexusForm((prev) => ({ ...prev, active }))
                    }
                  />
                  <FormActions onTest={() => api.testNexus(editNexusForm)} />
                </form>
              )}
            />
          </IntegrationCard>
        </div>
      ) : null}
      {section === "users" ? (
        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
            <CardDescription>Admin can manage portal users.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <form
              className="grid gap-3 md:grid-cols-[120px_1fr_1fr_auto]"
              onSubmit={(e) => {
                e.preventDefault()
                void createUser().catch((error) => setMessage(error.message))
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium">Role</Label>
                <Select
                  value={userForm.role}
                  onValueChange={(value) =>
                    setUserForm((prev) => ({
                      ...prev,
                      role: value as "admin" | "viewer",
                    }))
                  }
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">viewer</SelectItem>
                    <SelectItem value="admin">admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <TextInput
                label="Username"
                value={userForm.username}
                onChange={(username) =>
                  setUserForm((prev) => ({ ...prev, username }))
                }
                required
              />
              <PasswordInput
                label="Password"
                value={userForm.password}
                onChange={(password) =>
                  setUserForm((prev) => ({ ...prev, password }))
                }
                required
              />
              <div className="flex items-end">
                <Button className="w-full" type="submit">
                  <Check data-icon="inline-start" />
                  Create
                </Button>
              </div>
            </form>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Password</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.username}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{user.role}</Badge>
                    </TableCell>
                    <TableCell>
                      {user.mustChangePassword ? "Change required" : "Set"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function ResourceForm({
  value,
  onChange,
  onSave,
}: {
  value: VMResource
  onChange: (value: VMResource) => void
  onSave: () => void
}) {
  return (
    <form
      className="grid gap-3 md:grid-cols-6"
      onSubmit={(e) => {
        e.preventDefault()
        onSave()
      }}
    >
      <TextInput
        label="Name"
        value={value.name}
        onChange={(name) => onChange({ ...value, name })}
        required
      />
      <TextInput
        label="Address"
        value={value.address}
        onChange={(address) => onChange({ ...value, address })}
        required
      />
      <TextInput
        label="Description"
        value={value.description ?? ""}
        onChange={(description) => onChange({ ...value, description })}
      />
      <div className="flex items-end">
        <Button className="w-full" type="submit">
          <Check data-icon="inline-start" />
          Save
        </Button>
      </div>
      <div className="flex items-end">
        <ActiveToggle
          checked={value.active}
          onChange={(active) => onChange({ ...value, active })}
        />
      </div>
    </form>
  )
}

function ResourceTable({
  items,
  onEdit,
  onDelete,
}: {
  items: VMResource[]
  onEdit: (item: VMResource) => void
  onDelete: (id: string) => void
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Address</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-28" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell>{item.name}</TableCell>
            <TableCell className="font-mono">{item.address}</TableCell>
            <TableCell>
              <Badge variant={item.active ? "secondary" : "outline"}>
                {item.active ? "active" : "inactive"}
              </Badge>
            </TableCell>
            <TableCell className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => onEdit(item)}>
                Edit
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Delete VM"
                onClick={() => onDelete(item.id)}
              >
                <Trash2 data-icon="inline-start" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function IntegrationCard({
  title,
  configured,
  children,
}: {
  title: string
  configured: number
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span>{title}</span>
          <Badge variant="outline">{configured} configured</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  )
}

function IntegrationList<
  T extends { id: string; name: string; active: boolean },
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
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex flex-col gap-3 rounded-md border p-3 text-sm"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 truncate font-medium">{item.name}</div>
            <div className="flex items-center gap-2">
              <Badge variant={item.active ? "secondary" : "outline"}>
                {item.active ? "active" : "inactive"}
              </Badge>
              <Button variant="outline" size="sm" onClick={() => onEdit(item)}>
                {editingId === item.id ? "Cancel" : "Edit"}
              </Button>
              {onDelete ? (
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Delete integration"
                  onClick={() => onDelete(item.id)}
                >
                  <Trash2 data-icon="inline-start" />
                </Button>
              ) : null}
            </div>
          </div>
          {editingId === item.id && renderEditForm && (
            <div className="border-t pt-3 flex flex-col gap-3 animate-slide-down">
              {renderEditForm(item)}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  required?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      />
    </div>
  )
}

function PasswordInput({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
}) {
  const [visible, setVisible] = React.useState(false)
  const Icon = visible ? EyeOff : Eye

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      <div className="relative">
        <Input
          className="pr-10"
          type={visible ? "text" : "password"}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          required={required}
        />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-1/2 right-1 size-7 -translate-y-1/2"
                onClick={() => setVisible((current) => !current)}
              >
                <Icon data-icon="inline-start" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {visible ? `Hide ${label}` : `Show ${label}`}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  )
}

function SecretInput({
  configured,
  value,
  onChange,
  required,
}: {
  configured: boolean
  value: string
  onChange: (value: string) => void
  required?: boolean
}) {
  return (
    <PasswordInput
      label="Secret"
      value={value}
      placeholder={configured ? "Configured - enter only to replace" : ""}
      onChange={onChange}
      required={required}
    />
  )
}

function ActiveToggle({
  id = "active-toggle",
  checked,
  onChange,
}: {
  id?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(checked) => onChange(!!checked)}
      />
      <Label htmlFor={id} className="text-xs font-medium cursor-pointer">
        Active
      </Label>
    </div>
  )
}

function FormActions({
  onTest,
}: {
  onTest: () => Promise<TestResult>
}) {
  const [isLoading, setIsLoading] = React.useState(false)
  const [result, setResult] = React.useState<{ ok: boolean; message: string } | null>(null)

  const handleTest = async () => {
    setIsLoading(true)
    setResult(null)
    try {
      const res = await onTest()
      setResult({
        ok: res.ok,
        message: res.ok
          ? "Test Success."
          : `Test failed: ${res.error?.message ?? res.status}`,
      })
    } catch (error) {
      setResult({
        ok: false,
        message: `Test failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-2">
        <Button type="submit" disabled={isLoading}>
          <Check data-icon="inline-start" />
          Save
        </Button>
        <Button variant="outline" type="button" onClick={handleTest} disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : (
            <TestTube2 data-icon="inline-start" />
          )}
          Test connection
        </Button>
      </div>
      {result && (
        <Badge
          variant={result.ok ? "outline" : "destructive"}
          className={`h-7 px-2 rounded-md text-xs font-medium whitespace-nowrap ${result.ok
            ? "bg-green-500/10 text-green-600 border-green-500/20 dark:text-green-400"
            : ""
            }`}
        >
          {result.message}
        </Badge>
      )}
    </div>
  )
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

export function parseProjects(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|").map((part) => part.trim())
      const [name, rawPath, defaultBranch = "main", link = ""] = parts
      const path = rawPath || name
      return {
        id: "",
        name,
        path,
        defaultBranch,
        link: link || null,
        active: true,
      }
    })
}
