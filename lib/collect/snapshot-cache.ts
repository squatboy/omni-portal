import type {
  CollectEnvelope,
  OverviewData,
  RuntimeCollectSource,
  SourceEnvelope,
  SourceEnvelopeMap,
  SourceSummary,
} from "@/lib/collect/types"

export const runtimeCollectSources = [
  "vms",
  "kubernetes",
  "argocd",
  "gitlab",
  "nexus",
] as const satisfies RuntimeCollectSource[]

export type CollectSnapshot = SourceEnvelopeMap & {
  overview: SourceEnvelope<"overview">
}

export function createCollectSnapshot(
  sourceEnvelopes: SourceEnvelopeMap,
  generatedAt: string
): CollectSnapshot {
  return {
    ...sourceEnvelopes,
    overview: buildOverviewEnvelope(sourceEnvelopes, generatedAt),
  }
}

export function rebuildOverview(
  snapshot: CollectSnapshot,
  generatedAt: string
): CollectSnapshot {
  return {
    ...snapshot,
    overview: buildOverviewEnvelope(snapshot, generatedAt),
  }
}

export function buildOverviewEnvelope(
  sourceEnvelopes: SourceEnvelopeMap,
  generatedAt: string
): CollectEnvelope<OverviewData, "overview"> {
  const sources = runtimeCollectSources.map((source) =>
    summarize(sourceEnvelopes[source])
  )
  const allOk = sources.every((source) => source.status === "ok")
  const anyKnown = sources.some((source) => source.status !== "unknown")

  return {
    source: "overview",
    status: "ok",
    attemptedAt: generatedAt,
    collectedAt: generatedAt,
    stale: false,
    error: null,
    data: {
      health: allOk ? "ok" : anyKnown ? "degraded" : "unknown",
      generatedAt,
      sources,
    },
  }
}

function summarize<TSource extends RuntimeCollectSource>(
  envelope: SourceEnvelope<TSource>
): SourceSummary {
  return {
    source: envelope.source,
    status: envelope.status,
    attemptedAt: envelope.attemptedAt,
    collectedAt: envelope.collectedAt,
    stale: envelope.stale,
    error: envelope.error,
  }
}
