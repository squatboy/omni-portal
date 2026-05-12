import { exec } from "child_process"
import { promisify } from "util"

import { getInventoryConfig } from "@/lib/collect/config"
import type { CollectAdapterResult } from "@/lib/collect/adapters"
import type { VmPingState, VmStatus } from "@/lib/collect/types"

const execAsync = promisify(exec)

export async function collectVms(
  signal: AbortSignal
): Promise<CollectAdapterResult<"vms">> {
  const config = getInventoryConfig()
  const vms = config.vms

  if (vms.length === 0) {
    return {
      status: "ok",
      collectedAt: new Date().toISOString(),
      stale: false,
      error: null,
      data: { items: [] },
    }
  }

  const results = await Promise.all(
    vms.map(async (vm) => {
      const state = await pingVm(vm.address, signal)
      return {
        ...vm,
        state,
        lastCheckedAt: new Date().toISOString(),
      } as VmStatus
    })
  )

  const upCount = results.filter((r) => r.state === "up").length
  const status =
    vms.length > 0 && upCount === 0
      ? "down"
      : upCount < vms.length
        ? "stale"
        : "ok"

  return {
    status,
    collectedAt: new Date().toISOString(),
    stale: false,
    error: null,
    data: {
      items: results,
    },
  }
}

async function pingVm(address: string, signal: AbortSignal): Promise<VmPingState> {
  // Linux: -c 1 (count 1), -W 1 (timeout 1s)
  // macOS: -c 1 (count 1), -t 1 (timeout 1s)
  const isWin = process.platform === "win32"
  const isMac = process.platform === "darwin"
  
  let command = `ping -c 1 -W 1 ${address}`
  if (isWin) {
    command = `ping -n 1 -w 1000 ${address}`
  } else if (isMac) {
    // Some macOS ping versions use -t for timeout, but -W is also supported in modern ones
    command = `ping -c 1 -t 1 ${address}`
  }

  try {
    await execAsync(command, { signal })
    return "up"
  } catch {
    if (signal.aborted) {
      return "unknown"
    }
    
    // If ping fails (exit code 1 or other), it's considered down
    return "down"
  }
}
