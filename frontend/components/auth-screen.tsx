"use client"

import * as React from "react"
import { Eye, EyeOff, LogIn, UserPlus } from "lucide-react"

import { api } from "@/lib/api"
import type { User } from "@/lib/types"
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function AuthScreen({
  setupRequired,
  onAuthenticated,
}: {
  setupRequired: boolean
  onAuthenticated: (user: User) => void
}) {
  const [username, setUsername] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)

  async function submit() {
    setError(null)
    try {
      if (setupRequired) {
        await api.setup({
          username,
          password,
        })
        const login = await api.login({ username, password })
        onAuthenticated(login.user)
        return
      }
      const login = await api.login({ username, password })
      onAuthenticated(login.user)
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Login failed."
      )
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{setupRequired ? "Omni setup" : "Omni login"}</CardTitle>
          <CardDescription>
            {setupRequired
              ? "Create the first admin user."
              : "Use your portal account."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <TextField label="Username" value={username} onChange={setUsername} />
          <PasswordField
            label="Password"
            value={password}
            onChange={setPassword}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button onClick={() => void submit()}>
            {setupRequired ? (
              <UserPlus data-icon="inline-start" />
            ) : (
              <LogIn data-icon="inline-start" />
            )}
            {setupRequired ? "Create admin" : "Login"}
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium">
      {label}
      <Input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function PasswordField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
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
              {visible ? "Hide password" : "Show password"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </label>
  )
}
