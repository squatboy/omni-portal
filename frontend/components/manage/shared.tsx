"use client"

import * as React from "react"
import {
  Check,
  Edit,
  Eye,
  EyeOff,
  Loader2,
  TestTube2,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { type TestResult } from "@/lib/api"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function showMessage(msg: string | null) {
  if (!msg) return
  const isError = ["fail", "error", "invalid", "not found"].some((kw) =>
    msg.toLowerCase().includes(kw)
  )
  if (isError) {
    toast.error(msg)
  } else {
    toast.success(msg)
  }
}

export function TextInput({
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

export function PasswordInput({
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

export function SecretInput({
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

export function ActiveToggle({
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
      <Label htmlFor={id} className="cursor-pointer text-xs font-medium">
        Active
      </Label>
    </div>
  )
}

export function FormActions({ onTest }: { onTest: () => Promise<TestResult> }) {
  const [isLoading, setIsLoading] = React.useState(false)
  const [result, setResult] = React.useState<{
    ok: boolean
    message: string
  } | null>(null)

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
        <Button
          variant="outline"
          type="button"
          onClick={handleTest}
          disabled={isLoading}
        >
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
          className={`h-7 rounded-md px-2 text-xs font-medium whitespace-nowrap ${
            result.ok
              ? "border-green-500/20 bg-green-500/10 text-green-600 dark:text-green-400"
              : ""
          }`}
        >
          {result.message}
        </Badge>
      )}
    </div>
  )
}

export function RowActions({
  onEdit,
  onDelete,
  deleteConfirmTitle,
  deleteConfirmDescription = "This action cannot be undone.",
}: {
  onEdit: () => void
  onDelete: () => void
  deleteConfirmTitle: string
  deleteConfirmDescription?: string
}) {
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  return (
    <>
      <div className="flex items-center gap-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Edit"
                onClick={onEdit}
              >
                <Edit data-icon="inline-start" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Edit</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="destructive"
                size="icon-sm"
                aria-label="Delete"
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2 data-icon="inline-start" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Delete</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirmDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                onDelete()
                setConfirmOpen(false)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

export function parseProjects(projectsText: string, branchText: string) {
  const branches = (branchText || "")
    .split("\n")
    .map((b) => b.trim())
    .filter(Boolean)
  return (projectsText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const defaultBranch = branches[index] || branches[0] || "main"
      return {
        id: "",
        name: line,
        path: line,
        defaultBranch,
        link: null,
        active: true,
      }
    })
}

export function parseRepositories(repositoriesText: string, branchText: string) {
  const branches = (branchText || "")
    .split("\n")
    .map((b) => b.trim())
    .filter(Boolean)
  return (repositoriesText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const defaultBranch = branches[index] || branches[0] || "main"
      return {
        id: "",
        name: line,
        fullName: line,
        defaultBranch,
        link: null,
        active: true,
      }
    })
}
