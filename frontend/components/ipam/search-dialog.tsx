"use client"

import * as React from "react"
import { Loader2, Search } from "lucide-react"

import { api } from "@/lib/api"
import type { IPAMSearchResult } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { StatusBadge } from "./shared"

function searchResultAddress(result: IPAMSearchResult) {
  return result.address?.address ?? result.queryAddress ?? result.subnet.cidr
}

function searchResultHostname(result: IPAMSearchResult) {
  return result.address?.hostname ?? null
}

export function IPAMSearchDialog({
  onSelect,
}: {
  onSelect: (result: IPAMSearchResult) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<IPAMSearchResult[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const requestIdRef = React.useRef(0)
  const hasQuery = query.trim().length > 0

  React.useEffect(() => {
    const normalizedQuery = query.trim()
    const timeout = window.setTimeout(() => {
      const requestId = ++requestIdRef.current
      if (!open || !normalizedQuery) return
      setLoading(true)
      setError(null)
      void api
        .searchIPAM(normalizedQuery)
        .then((nextResults) => {
          if (requestId === requestIdRef.current) {
            setResults(nextResults)
          }
        })
        .catch((searchError) => {
          if (requestId === requestIdRef.current) {
            setResults([])
            setError(
              searchError instanceof Error
                ? searchError.message
                : "Search failed."
            )
          }
        })
        .finally(() => {
          if (requestId === requestIdRef.current) {
            setLoading(false)
          }
        })
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [open, query])

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      requestIdRef.current += 1
      setQuery("")
      setResults([])
      setLoading(false)
      setError(null)
    }
  }

  function handleQueryChange(nextQuery: string) {
    setQuery(nextQuery)
    requestIdRef.current += 1
    setResults([])
    setLoading(nextQuery.trim().length > 0)
    setError(null)
  }

  return (
    <>
      <Button
        variant="outline"
        size="lg"
        className="w-56 justify-start font-normal text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Search data-icon="inline-start" />
        Search IP or hostname...
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={handleOpenChange}
        title="IPAM global search"
        description="Search IPAM addresses by IP address or hostname."
      >
        <Command shouldFilter={false}>
          <CommandInput
            autoFocus
            placeholder="Search IP or hostname..."
            value={query}
            onValueChange={handleQueryChange}
          />
          <CommandList>
            {!hasQuery ? (
              <CommandEmpty>Type an IP address or hostname.</CommandEmpty>
            ) : null}
            {hasQuery && loading ? (
              <div className="flex items-center gap-2 px-3 py-6 text-xs text-muted-foreground">
                <Loader2 data-icon="inline-start" className="animate-spin" />
                Searching
              </div>
            ) : null}
            {hasQuery && error ? <CommandEmpty>{error}</CommandEmpty> : null}
            {!loading && !error && hasQuery && results.length === 0 ? (
              <CommandEmpty>No results found.</CommandEmpty>
            ) : null}
            {hasQuery && results.length > 0 ? (
              <CommandGroup heading="Results">
                {results.map((result) => (
                  <CommandItem
                    key={result.id}
                    value={`${searchResultAddress(result)} ${searchResultHostname(result) ?? ""
                      } ${result.location.name} ${result.network.name} ${result.subnet.name
                      }`}
                    onSelect={() => {
                      onSelect(result)
                      setOpen(false)
                    }}
                    className="items-start"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="font-mono">
                          {searchResultAddress(result)}
                        </span>
                        {searchResultHostname(result) ? (
                          <span className="truncate text-foreground">
                            {searchResultHostname(result)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            No hostname
                          </span>
                        )}
                        {result.address ? (
                          <StatusBadge
                            status={result.address.status}
                            count={null}
                          />
                        ) : (
                          <Badge variant="outline">Subnet</Badge>
                        )}
                      </div>
                      <span className="truncate text-muted-foreground">
                        {result.location.name} / {result.network.name} /{" "}
                        {result.subnet.name}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
