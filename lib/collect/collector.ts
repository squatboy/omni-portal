import { createAdapters, type CollectAdapter } from "@/lib/collect/adapters"
import { mockSourceEnvelopes } from "@/lib/collect/mock-snapshot"
import {
  type CollectSnapshot,
  createCollectSnapshot,
  rebuildOverview,
} from "@/lib/collect/snapshot-cache"
import type {
  CollectError,
  CollectErrorCode,
  CollectSource,
  RuntimeCollectSource,
  SourceEnvelope,
} from "@/lib/collect/types"

const DEFAULT_COLLECT_INTERVAL_MS = 30_000
const globalCollectorKey = "__omniCollectorRuntime"

export type CollectorRuntime = {
  snapshot: CollectSnapshot
  adapters: CollectAdapter<RuntimeCollectSource>[]
  intervalMs: number
  intervalId: ReturnType<typeof setInterval> | null
  inFlight: Promise<void> | null
  started: boolean
}

declare global {
  var __omniCollectorRuntime: CollectorRuntime | undefined
}

export function ensureCollectorStarted() {
  const runtime = getCollectorRuntime()

  if (runtime.started) {
    return
  }

  runtime.started = true
  void collectOnce(runtime)
  runtime.intervalId = setInterval(() => {
    void collectOnce(runtime)
  }, runtime.intervalMs)
}

export function getCollectEnvelope<TSource extends CollectSource>(
  source: TSource
): SourceEnvelope<TSource> {
  const runtime = getCollectorRuntime()

  return runtime.snapshot[source] as SourceEnvelope<TSource>
}

export function createCollectorRuntime(
  adapters: CollectAdapter<RuntimeCollectSource>[] = createAdapters(),
  intervalMs = DEFAULT_COLLECT_INTERVAL_MS
): CollectorRuntime {
  const generatedAt = new Date().toISOString()

  return {
    snapshot: createCollectSnapshot(mockSourceEnvelopes, generatedAt),
    adapters,
    intervalMs,
    intervalId: null,
    inFlight: null,
    started: false,
  }
}

export function getCollectorRuntime(): CollectorRuntime {
  globalThis[globalCollectorKey] ??= createCollectorRuntime()

  return globalThis[globalCollectorKey]
}

export async function collectOnce(runtime: CollectorRuntime, now = new Date()) {
  if (runtime.inFlight) {
    return runtime.inFlight
  }

  runtime.inFlight = runCollection(runtime, now).finally(() => {
    runtime.inFlight = null
  })

  return runtime.inFlight
}

async function runCollection(runtime: CollectorRuntime, now: Date) {
  const attemptedAt = now.toISOString()
  const results = await Promise.all(
    runtime.adapters.map((adapter) =>
      collectSource(runtime, adapter, attemptedAt)
    )
  )

  runtime.snapshot = rebuildOverview(
    results.reduce(
      (snapshot, envelope) => ({
        ...snapshot,
        [envelope.source]: envelope,
      }),
      runtime.snapshot
    ),
    attemptedAt
  )
}

async function collectSource<TSource extends RuntimeCollectSource>(
  runtime: CollectorRuntime,
  adapter: CollectAdapter<TSource>,
  attemptedAt: string
): Promise<SourceEnvelope<TSource>> {
  const previous = runtime.snapshot[adapter.source] as SourceEnvelope<TSource>

  try {
    const result = await collectWithTimeout(adapter)

    return {
      source: adapter.source,
      status: result.status,
      attemptedAt,
      collectedAt:
        result.collectedAt ??
        (result.stale ? previous.collectedAt : attemptedAt),
      stale: result.stale,
      error: result.error,
      data: result.data,
    }
  } catch (error) {
    return buildFailureEnvelope(previous, attemptedAt, error)
  }
}

function collectWithTimeout<TSource extends RuntimeCollectSource>(
  adapter: CollectAdapter<TSource>
) {
  const controller = new AbortController()
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort()
      reject(new CollectorTimeoutError(adapter.source, adapter.timeoutMs))
    }, adapter.timeoutMs)
  })

  return Promise.race([adapter.collect(controller.signal), timeout]).finally(
    () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  )
}

function buildFailureEnvelope<TSource extends RuntimeCollectSource>(
  previous: SourceEnvelope<TSource>,
  attemptedAt: string,
  error: unknown
): SourceEnvelope<TSource> {
  const collectError = toCollectError(error)
  const hasLastCollectedData = previous.collectedAt !== null

  return {
    ...previous,
    status: hasLastCollectedData
      ? "stale"
      : statusFromErrorCode(collectError.code),
    attemptedAt,
    stale: hasLastCollectedData,
    error: collectError,
  }
}

function toCollectError(error: unknown): CollectError {
  if (error instanceof CollectorTimeoutError) {
    return {
      code: "TIMEOUT",
      message: error.message,
    }
  }

  return {
    code: "UNKNOWN_ERROR",
    message: error instanceof Error ? error.message : "Collector failed.",
  }
}

function statusFromErrorCode(code: CollectErrorCode) {
  switch (code) {
    case "TIMEOUT":
      return "timeout"
    case "PERMISSION_DENIED":
      return "permission_error"
    case "CONNECTION_FAILED":
      return "down"
    case "UNKNOWN_ERROR":
      return "unknown"
  }
}

class CollectorTimeoutError extends Error {
  constructor(source: RuntimeCollectSource, timeoutMs: number) {
    super(`${source} collector exceeded ${timeoutMs}ms timeout.`)
    this.name = "CollectorTimeoutError"
  }
}
