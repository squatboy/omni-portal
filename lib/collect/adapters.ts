import { mockSourceEnvelopes } from "@/lib/collect/mock-snapshot"
import { runtimeCollectSources } from "@/lib/collect/snapshot-cache"
import type { RuntimeCollectSource, SourceEnvelope } from "@/lib/collect/types"
import { collectNexus } from "@/lib/collect/nexus"
import { collectGitLab } from "@/lib/collect/gitlab"
import { collectKubernetes } from "@/lib/collect/kubernetes"
import { collectArgoCd } from "@/lib/collect/argocd"
import { collectVms } from "@/lib/collect/vms"

export type CollectAdapterResult<TSource extends RuntimeCollectSource> = Pick<
  SourceEnvelope<TSource>,
  "status" | "collectedAt" | "stale" | "error" | "data"
>

export type CollectAdapter<TSource extends RuntimeCollectSource> = {
  source: TSource
  timeoutMs: number
  collect: (signal: AbortSignal) => Promise<CollectAdapterResult<TSource>>
}

export function createAdapters(): CollectAdapter<RuntimeCollectSource>[] {
  return runtimeCollectSources.map((source) => {
    switch (source) {
      case "kubernetes":
        return asRuntimeAdapter({
          source: "kubernetes",
          timeoutMs: 15_000,
          collect: collectKubernetes,
        })
      case "argocd":
        return asRuntimeAdapter({
          source: "argocd",
          timeoutMs: 10_000,
          collect: collectArgoCd,
        })
      case "gitlab":
        return asRuntimeAdapter({
          source: "gitlab",
          timeoutMs: 15_000,
          collect: collectGitLab,
        })
      case "nexus":
        return asRuntimeAdapter({
          source: "nexus",
          timeoutMs: 5_000,
          collect: collectNexus,
        })
      case "vms":
        return asRuntimeAdapter({
          source: "vms",
          timeoutMs: 10_000,
          collect: collectVms,
        })
    }
  })
}

export function createMockAdapters(): CollectAdapter<RuntimeCollectSource>[] {
  return runtimeCollectSources.map((source) =>
    asRuntimeAdapter(createMockAdapter(source, mockSourceEnvelopes[source]))
  )
}

function createMockAdapter<TSource extends RuntimeCollectSource>(
  source: TSource,
  envelope: SourceEnvelope<TSource>
): CollectAdapter<TSource> {
  return {
    source,
    timeoutMs: 2_000,
    async collect() {
      return {
        status: envelope.status,
        collectedAt: envelope.collectedAt,
        stale: envelope.stale,
        error: envelope.error,
        data: envelope.data,
      }
    },
  }
}

function asRuntimeAdapter<TSource extends RuntimeCollectSource>(
  adapter: CollectAdapter<TSource>
): CollectAdapter<RuntimeCollectSource> {
  return adapter as CollectAdapter<RuntimeCollectSource>
}
