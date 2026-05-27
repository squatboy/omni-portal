"use client"

import * as React from "react"
import { type ColumnDef } from "@tanstack/react-table"
import { Check } from "lucide-react"

import { api } from "@/lib/api"
import type { VMResource } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { DataTable } from "@/components/ui/data-table"
import { ActiveToggle, RowActions, showMessage, TextInput } from "./shared"

const emptyVM: VMResource = {
  id: "",
  name: "",
  address: "",
  description: "",
  active: true,
}

export function VMSection() {
  const [vms, setVMs] = React.useState<VMResource[]>([])
  const [vmForm, setVMForm] = React.useState<VMResource>(emptyVM)
  const [editingVMId, setEditingVMId] = React.useState<string | null>(null)
  const [editVMForm, setEditVMForm] = React.useState<VMResource>(emptyVM)

  const loadVMs = React.useCallback(async () => {
    const nextVMs = await api.listVMs()
    setVMs(nextVMs ?? [])
  }, [])

  React.useEffect(() => {
    const id = window.setTimeout(() => {
      void loadVMs()
    }, 0)
    return () => window.clearTimeout(id)
  }, [loadVMs])

  async function saveVM(form: VMResource, isEdit = false) {
    await api.saveVM(form)
    if (!isEdit) setVMForm(emptyVM)
    showMessage("VM saved.")
    await loadVMs()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>VM Resources</CardTitle>
        <CardDescription>Ping targets used by the dashboard.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ResourceForm
          value={vmForm}
          onChange={setVMForm}
          onSave={() =>
            void saveVM(vmForm, false).catch((error) =>
              showMessage(error.message)
            )
          }
        />
        <ResourceTable
          items={vms}
          editingId={editingVMId}
          onEdit={(item) => {
            if (editingVMId === item.id) {
              setEditingVMId(null)
              setEditVMForm(emptyVM)
            } else {
              setEditingVMId(item.id)
              setEditVMForm({ ...item })
            }
          }}
          onDelete={(id) =>
            void api
              .deleteVM(id)
              .then(loadVMs)
              .catch((error) => showMessage(error.message))
          }
          renderEditForm={() => (
            <form
              className="grid gap-3 md:grid-cols-6"
              onSubmit={(e) => {
                e.preventDefault()
                void saveVM(editVMForm, true)
                  .then(() => setEditingVMId(null))
                  .catch((error) => showMessage(error.message))
              }}
            >
              <TextInput
                label="Name"
                value={editVMForm.name}
                onChange={(name) =>
                  setEditVMForm((prev) => ({ ...prev, name }))
                }
                required
              />
              <TextInput
                label="Address"
                value={editVMForm.address}
                onChange={(address) =>
                  setEditVMForm((prev) => ({ ...prev, address }))
                }
                required
              />
              <TextInput
                label="Description"
                value={editVMForm.description ?? ""}
                onChange={(description) =>
                  setEditVMForm((prev) => ({ ...prev, description }))
                }
              />
              <div className="flex items-end">
                <Button className="w-full" type="submit">
                  <Check data-icon="inline-start" />
                  Save
                </Button>
              </div>
              <div className="flex items-end">
                <ActiveToggle
                  id={`vm-active-${editingVMId}`}
                  checked={editVMForm.active}
                  onChange={(active) =>
                    setEditVMForm((prev) => ({ ...prev, active }))
                  }
                />
              </div>
            </form>
          )}
        />
      </CardContent>
    </Card>
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
  editingId,
  renderEditForm,
}: {
  items: VMResource[]
  onEdit: (item: VMResource) => void
  onDelete: (id: string) => void
  editingId?: string | null
  renderEditForm?: (item: VMResource) => React.ReactNode
}) {
  const columns = React.useMemo<ColumnDef<VMResource>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <div className="font-medium">{row.original.name}</div>
        ),
      },
      {
        accessorKey: "address",
        header: "Address",
        cell: ({ row }) => (
          <div className="font-mono text-xs text-muted-foreground">
            {row.original.address}
          </div>
        ),
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
                onDelete={() => onDelete(item.id)}
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
