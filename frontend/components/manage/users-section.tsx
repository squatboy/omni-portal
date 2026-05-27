"use client"

import * as React from "react"
import { Check } from "lucide-react"
import { toast } from "sonner"

import { api } from "@/lib/api"
import type { User } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PasswordInput, RowActions, showMessage, TextInput } from "./shared"

export function UsersSection() {
  const [users, setUsers] = React.useState<User[]>([])
  const [userForm, setUserForm] = React.useState({
    username: "",
    role: "viewer" as "admin" | "viewer",
    password: "",
    mustChangePassword: false,
  })
  const [editingUser, setEditingUser] = React.useState<User | null>(null)
  const [editUserPassword, setEditUserPassword] = React.useState("")

  const loadUsers = React.useCallback(async () => {
    const nextUsers = await api.listUsers()
    setUsers(nextUsers ?? [])
  }, [])

  React.useEffect(() => {
    const id = window.setTimeout(() => {
      void loadUsers()
    }, 0)
    return () => window.clearTimeout(id)
  }, [loadUsers])

  async function createUser() {
    await api.createUser(userForm)
    setUserForm({
      username: "",
      role: "viewer",
      password: "",
      mustChangePassword: false,
    })
    showMessage("User created.")
    await loadUsers()
  }

  async function handleResetPassword() {
    await api.updateUser(editingUser!.id, { password: editUserPassword })
    setEditingUser(null)
    setEditUserPassword("")
    toast.success("Password updated.")
  }

  return (
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
            void createUser().catch((error) => showMessage(error.message))
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
              <TableHead className="w-20">Actions</TableHead>
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
                  <RowActions
                    onEdit={() => {
                      setEditingUser(user)
                      setEditUserPassword("")
                    }}
                    onDelete={() =>
                      void api
                        .deleteUser(user.id)
                        .then(loadUsers)
                        .then(() => toast.success("User deleted."))
                    }
                    deleteConfirmTitle={`Delete ${user.username}`}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {editingUser ? (
          <Sheet
            open
            onOpenChange={(open) => {
              if (!open) setEditingUser(null)
            }}
          >
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Edit {editingUser.username}</SheetTitle>
                <SheetDescription>
                  Set a new password for this user.
                </SheetDescription>
              </SheetHeader>
              <form
                className="flex flex-col gap-4 px-6"
                onSubmit={(e) => {
                  e.preventDefault()
                  void handleResetPassword()
                }}
              >
                <PasswordInput
                  label="New Password"
                  value={editUserPassword}
                  onChange={setEditUserPassword}
                  required
                />
                <SheetFooter className="px-0">
                  <Button type="submit">Save</Button>
                </SheetFooter>
              </form>
            </SheetContent>
          </Sheet>
        ) : null}
      </CardContent>
    </Card>
  )
}
