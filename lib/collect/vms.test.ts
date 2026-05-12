import { describe, expect, it, vi, beforeEach } from "vitest"
import { collectVms } from "@/lib/collect/vms"
import type { CollectInventoryConfig } from "@/lib/collect/types"

const baseConfig: CollectInventoryConfig = {
  nexus: { url: "" },
  gitlab: { baseUrl: "", projects: [] },
  argocd: { baseUrl: "" },
  kubernetes: {
    clusterName: "",
    namespaces: [],
    appNamespaces: [],
  },
  vms: [
    { id: "vm1", name: "VM1", address: "1.1.1.1" },
    { id: "vm2", name: "VM2", address: "2.2.2.2" },
  ],
}

let testConfig: CollectInventoryConfig = structuredClone(baseConfig)

vi.mock("@/lib/collect/config", () => ({
  getInventoryConfig: () => testConfig,
}))

// Mock child_process
const execMock = vi.fn()
vi.mock("child_process", () => ({
  exec: (cmd: string, options: { signal: AbortSignal }, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
    execMock(cmd, options, callback)
  },
}))

/* eslint-disable @typescript-eslint/no-explicit-any */
// Mock promisify to use our mocked exec
vi.mock("util", async (importOriginal) => {
  const actual = await importOriginal<typeof import("util")>()
  return {
    ...actual,
    promisify: (fn: any) => {
      if (fn.name === "exec" || fn.toString().includes("exec")) {
        return (cmd: string, options: any) => {
          return new Promise((resolve, reject) => {
            execMock(cmd, options, (error: any, stdout: any, stderr: any) => {
              if (error) reject(error)
              else resolve({ stdout, stderr })
            })
          })
        }
      }
      return actual.promisify(fn)
    },
  }
})
/* eslint-enable @typescript-eslint/no-explicit-any */

describe("collectVms", () => {
  beforeEach(() => {
    testConfig = structuredClone(baseConfig)
    execMock.mockReset()
  })

  it("returns up when ping succeeds", async () => {
    execMock.mockImplementation((cmd, opts, cb) => cb(null, { stdout: "ok" }, ""))

    const result = await collectVms(new AbortController().signal)

    expect(result.status).toBe("ok")
    expect(result.data.items).toHaveLength(2)
    expect(result.data.items[0].state).toBe("up")
    expect(result.data.items[1].state).toBe("up")
    expect(execMock).toHaveBeenCalledTimes(2)
  })

  it("returns stale when some pings fail", async () => {
    execMock.mockImplementation((cmd, opts, cb) => {
      if (cmd.includes("1.1.1.1")) {
        cb(new Error("failed"), "", "")
      } else {
        cb(null, { stdout: "ok" }, "")
      }
    })

    const result = await collectVms(new AbortController().signal)

    expect(result.status).toBe("stale")
    expect(result.data.items[0].state).toBe("down")
    expect(result.data.items[1].state).toBe("up")
  })

  it("returns down when all pings fail", async () => {
    execMock.mockImplementation((cmd, opts, cb) => {
      cb(new Error("failed"), "", "")
    })

    const result = await collectVms(new AbortController().signal)

    expect(result.status).toBe("down")
    expect(result.data.items[0].state).toBe("down")
    expect(result.data.items[1].state).toBe("down")
  })

  it("returns unknown when signal is aborted", async () => {
    const controller = new AbortController()
    controller.abort()
    
    // In our mock, if signal is aborted, we should simulate that
    execMock.mockImplementation((cmd, opts, cb) => {
        if (opts.signal.aborted) {
            cb(new Error("aborted"), "", "")
        } else {
            cb(null, { stdout: "ok" }, "")
        }
    })

    const result = await collectVms(controller.signal)

    expect(result.data.items[0].state).toBe("unknown")
  })
})
