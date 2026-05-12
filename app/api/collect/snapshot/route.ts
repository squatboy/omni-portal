import { type NextRequest, NextResponse } from "next/server"

import {
  collectOnce,
  ensureCollectorStarted,
  getCollectEnvelope,
  getCollectorRuntime,
} from "@/lib/collect/collector"

export async function GET(request: NextRequest) {
  ensureCollectorStarted()

  const { searchParams } = new URL(request.url)
  const force = searchParams.get("force") === "true"

  if (force) {
    const runtime = getCollectorRuntime()
    await collectOnce(runtime)
  }

  return NextResponse.json({
    overview: getCollectEnvelope("overview"),
    vms: getCollectEnvelope("vms"),
    kubernetes: getCollectEnvelope("kubernetes"),
    argocd: getCollectEnvelope("argocd"),
    gitlab: getCollectEnvelope("gitlab"),
    nexus: getCollectEnvelope("nexus"),
  })
}
