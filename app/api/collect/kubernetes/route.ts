import { NextResponse } from "next/server"

import {
  ensureCollectorStarted,
  getCollectEnvelope,
} from "@/lib/collect/collector"

export function GET() {
  ensureCollectorStarted()

  return NextResponse.json(getCollectEnvelope("kubernetes"))
}
