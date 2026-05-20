"use client"

import * as React from "react"
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Save,
  TestTube2,
  Trash2,
} from "lucide-react"

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
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  link: "",
  active: true,
}

const emptyKubernetes: KubernetesIntegration & { token: string } = {
  id: "",
  name: "",
  clusterName: "",
  apiUrl: "",
  namespaces: [],
  appNamespaces: [],
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

export function ManagePanel() {
  const [vms, setVMs] = React.useState<VMResource[]>([])
  const [kubernetes, setKubernetes] = React.useState<KubernetesIntegration[]>(
    []
  )
  const [argocd, setArgoCD] = React.useState<ArgoCDIntegration[]>([])
  const [gitlab, setGitLab] = React.useState<GitLabIntegration[]>([])
  const [nexus, setNexus] = React.useState<NexusIntegration[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [message, setMessage] = React.useState<string | null>(null)
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

  const load = React.useCallback(async () => {
    const [
      nextVMs,
      nextKubernetes,
      nextArgoCD,
      nextGitLab,
      nextNexus,
      nextUsers,
    ] = await Promise.all([
      api.listVMs(),
      api.listKubernetes(),
      api.listArgoCD(),
      api.listGitLab(),
      api.listNexus(),
      api.listUsers(),
    ])
    setVMs(nextVMs)
    setKubernetes(nextKubernetes)
    setArgoCD(nextArgoCD)
    setGitLab(nextGitLab)
    setNexus(nextNexus)
    setUsers(nextUsers)
  }, [])

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
    await load()
  }

  async function saveKubernetes() {
    await api.saveKubernetes(kubernetesForm)
    setKubernetesForm(emptyKubernetes)
    setMessage("Kubernetes integration saved.")
    await load()
  }

  async function saveArgoCD() {
    await api.saveArgoCD(argocdForm)
    setArgoCDForm(emptyArgoCD)
    setMessage("ArgoCD integration saved.")
    await load()
  }

  async function saveGitLab() {
    await api.saveGitLab({
      ...gitlabForm,
      projects: parseProjects(gitlabForm.projectsText),
    })
    setGitLabForm(emptyGitLab)
    setMessage("GitLab integration saved.")
    await load()
  }

  async function saveNexus() {
    await api.saveNexus(nexusForm)
    setNexusForm(emptyNexus)
    setMessage("Nexus integration saved.")
    await load()
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
    await load()
  }

  async function runTest(test: () => Promise<TestResult>) {
    const result = await test()
    setMessage(
      result.ok
        ? `Test ${result.status}.`
        : `Test failed: ${result.error?.message ?? result.status}`
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {message ? (
        <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
          <CheckCircle2 data-icon="inline-start" />
          <span>{message}</span>
        </div>
      ) : null}
      <Tabs defaultValue="resources" className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="resources">Resources</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
        </TabsList>
        <TabsContent value="resources">
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
                    .then(load)
                    .catch((error) => setMessage(error.message))
                }
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="integrations">
          <div className="grid gap-4 xl:grid-cols-2">
            <IntegrationCard title="Kubernetes" configured={kubernetes.length}>
              <TextInput
                label="Name"
                value={kubernetesForm.name}
                onChange={(name) =>
                  setKubernetesForm((prev) => ({ ...prev, name }))
                }
              />
              <TextInput
                label="Cluster"
                value={kubernetesForm.clusterName}
                onChange={(clusterName) =>
                  setKubernetesForm((prev) => ({ ...prev, clusterName }))
                }
              />
              <TextInput
                label="API URL"
                value={kubernetesForm.apiUrl}
                onChange={(apiUrl) =>
                  setKubernetesForm((prev) => ({ ...prev, apiUrl }))
                }
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
              />
              <TextInput
                label="App namespaces"
                value={kubernetesForm.appNamespaces.join(",")}
                onChange={(value) =>
                  setKubernetesForm((prev) => ({
                    ...prev,
                    appNamespaces: splitList(value),
                  }))
                }
              />
              <SecretInput
                configured={kubernetesForm.tokenConfigured}
                value={kubernetesForm.token}
                onChange={(token) =>
                  setKubernetesForm((prev) => ({ ...prev, token }))
                }
              />
              <ActiveToggle
                checked={kubernetesForm.active}
                onChange={(active) =>
                  setKubernetesForm((prev) => ({ ...prev, active }))
                }
              />
              <FormActions
                onSave={() =>
                  void saveKubernetes().catch((error) =>
                    setMessage(error.message)
                  )
                }
                onTest={() =>
                  void runTest(() => api.testKubernetes(kubernetesForm)).catch(
                    (error) => setMessage(error.message)
                  )
                }
              />
              <IntegrationList
                items={kubernetes}
                onEdit={(item) => setKubernetesForm({ ...item, token: "" })}
                onDelete={(id) =>
                  void api
                    .deleteKubernetes(id)
                    .then(load)
                    .catch((error) => setMessage(error.message))
                }
              />
            </IntegrationCard>
            <IntegrationCard title="ArgoCD" configured={argocd.length}>
              <TextInput
                label="Name"
                value={argocdForm.name}
                onChange={(name) =>
                  setArgoCDForm((prev) => ({ ...prev, name }))
                }
              />
              <TextInput
                label="Base URL"
                value={argocdForm.baseUrl}
                onChange={(baseUrl) =>
                  setArgoCDForm((prev) => ({ ...prev, baseUrl }))
                }
              />
              <SecretInput
                configured={argocdForm.tokenConfigured}
                value={argocdForm.token}
                onChange={(token) =>
                  setArgoCDForm((prev) => ({ ...prev, token }))
                }
              />
              <ActiveToggle
                checked={argocdForm.active}
                onChange={(active) =>
                  setArgoCDForm((prev) => ({ ...prev, active }))
                }
              />
              <FormActions
                onSave={() =>
                  void saveArgoCD().catch((error) => setMessage(error.message))
                }
                onTest={() =>
                  void runTest(() => api.testArgoCD(argocdForm)).catch(
                    (error) => setMessage(error.message)
                  )
                }
              />
              <IntegrationList
                items={argocd}
                onEdit={(item) => setArgoCDForm({ ...item, token: "" })}
                onDelete={(id) =>
                  void api
                    .deleteArgoCD(id)
                    .then(load)
                    .catch((error) => setMessage(error.message))
                }
              />
            </IntegrationCard>
            <IntegrationCard title="GitLab" configured={gitlab.length}>
              <TextInput
                label="Name"
                value={gitlabForm.name}
                onChange={(name) =>
                  setGitLabForm((prev) => ({ ...prev, name }))
                }
              />
              <TextInput
                label="Base URL"
                value={gitlabForm.baseUrl}
                onChange={(baseUrl) =>
                  setGitLabForm((prev) => ({ ...prev, baseUrl }))
                }
              />
              <TextInput
                label="Projects"
                value={gitlabForm.projectsText}
                onChange={(projectsText) =>
                  setGitLabForm((prev) => ({ ...prev, projectsText }))
                }
                placeholder="name|group/project|main"
              />
              <SecretInput
                configured={gitlabForm.tokenConfigured}
                value={gitlabForm.token}
                onChange={(token) =>
                  setGitLabForm((prev) => ({ ...prev, token }))
                }
              />
              <ActiveToggle
                checked={gitlabForm.active}
                onChange={(active) =>
                  setGitLabForm((prev) => ({ ...prev, active }))
                }
              />
              <FormActions
                onSave={() =>
                  void saveGitLab().catch((error) => setMessage(error.message))
                }
                onTest={() =>
                  void runTest(() =>
                    api.testGitLab({
                      ...gitlabForm,
                      projects: parseProjects(gitlabForm.projectsText),
                    })
                  ).catch((error) => setMessage(error.message))
                }
              />
              <IntegrationList
                items={gitlab}
                onEdit={(item) =>
                  setGitLabForm({
                    ...item,
                    token: "",
                    projectsText: item.projects
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
                onDelete={(id) =>
                  void api
                    .deleteGitLab(id)
                    .then(load)
                    .catch((error) => setMessage(error.message))
                }
              />
            </IntegrationCard>
            <IntegrationCard title="Nexus" configured={nexus.length}>
              <TextInput
                label="Name"
                value={nexusForm.name}
                onChange={(name) => setNexusForm((prev) => ({ ...prev, name }))}
              />
              <TextInput
                label="URL"
                value={nexusForm.url}
                onChange={(url) => setNexusForm((prev) => ({ ...prev, url }))}
              />
              <ActiveToggle
                checked={nexusForm.active}
                onChange={(active) =>
                  setNexusForm((prev) => ({ ...prev, active }))
                }
              />
              <FormActions
                onSave={() =>
                  void saveNexus().catch((error) => setMessage(error.message))
                }
                onTest={() =>
                  void runTest(() => api.testNexus(nexusForm)).catch((error) =>
                    setMessage(error.message)
                  )
                }
              />
              <IntegrationList
                items={nexus}
                onEdit={setNexusForm}
                onDelete={(id) =>
                  void api
                    .deleteNexus(id)
                    .then(load)
                    .catch((error) => setMessage(error.message))
                }
              />
            </IntegrationCard>
          </div>
        </TabsContent>
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>Users</CardTitle>
              <CardDescription>Admin can manage portal users.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-3 md:grid-cols-4">
                <TextInput
                  label="Username"
                  value={userForm.username}
                  onChange={(username) =>
                    setUserForm((prev) => ({ ...prev, username }))
                  }
                />
                <label className="flex flex-col gap-1 text-xs font-medium">
                  Role
                  <select
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                    value={userForm.role}
                    onChange={(event) =>
                      setUserForm((prev) => ({
                        ...prev,
                        role: event.target.value as "admin" | "viewer",
                      }))
                    }
                  >
                    <option value="viewer">viewer</option>
                    <option value="admin">admin</option>
                  </select>
                </label>
                <PasswordInput
                  label="Password"
                  value={userForm.password}
                  onChange={(password) =>
                    setUserForm((prev) => ({ ...prev, password }))
                  }
                />
                <div className="flex items-end">
                  <Button
                    className="w-full"
                    onClick={() =>
                      void createUser().catch((error) =>
                        setMessage(error.message)
                      )
                    }
                  >
                    <Save data-icon="inline-start" />
                    Create
                  </Button>
                </div>
              </div>
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
        </TabsContent>
      </Tabs>
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
    <div className="grid gap-3 md:grid-cols-6">
      <TextInput
        label="Name"
        value={value.name}
        onChange={(name) => onChange({ ...value, name })}
      />
      <TextInput
        label="Address"
        value={value.address}
        onChange={(address) => onChange({ ...value, address })}
      />
      <TextInput
        label="Description"
        value={value.description ?? ""}
        onChange={(description) => onChange({ ...value, description })}
      />
      <TextInput
        label="Link"
        value={value.link ?? ""}
        onChange={(link) => onChange({ ...value, link })}
      />
      <div className="flex items-end">
        <Button className="w-full" onClick={onSave}>
          <Save data-icon="inline-start" />
          Save
        </Button>
      </div>
      <div className="flex items-end">
        <ActiveToggle
          checked={value.active}
          onChange={(active) => onChange({ ...value, active })}
        />
      </div>
    </div>
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
}: {
  items: T[]
  onEdit: (item: T) => void
  onDelete?: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
        >
          <div className="min-w-0 truncate">{item.name}</div>
          <div className="flex items-center gap-2">
            <Badge variant={item.active ? "secondary" : "outline"}>
              {item.active ? "active" : "inactive"}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => onEdit(item)}>
              Edit
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
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium">
      {label}
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function PasswordInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const [visible, setVisible] = React.useState(false)
  const Icon = visible ? EyeOff : Eye

  return (
    <label className="flex flex-col gap-1 text-xs font-medium">
      {label}
      <div className="relative">
        <Input
          className="pr-10"
          type={visible ? "text" : "password"}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
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
    </label>
  )
}

function SecretInput({
  configured,
  value,
  onChange,
}: {
  configured: boolean
  value: string
  onChange: (value: string) => void
}) {
  return (
    <PasswordInput
      label="Secret"
      value={value}
      placeholder={configured ? "Configured - enter only to replace" : ""}
      onChange={onChange}
    />
  )
}

function ActiveToggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-xs font-medium">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      Active
    </label>
  )
}

function FormActions({
  onSave,
  onTest,
}: {
  onSave: () => void
  onTest: () => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={onSave}>
        <Save data-icon="inline-start" />
        Save
      </Button>
      <Button variant="outline" onClick={onTest}>
        <TestTube2 data-icon="inline-start" />
        Test connection
      </Button>
    </div>
  )
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseProjects(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, path, defaultBranch = "main", link = ""] = line.split("|")
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
