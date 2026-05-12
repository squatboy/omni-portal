import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import path from "path"

import { afterEach, describe, expect, it, vi } from "vitest"

const originalCwd = process.cwd()

afterEach(() => {
  process.chdir(originalCwd)
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe("getInventoryConfig", () => {
  it("keeps a local fallback when inventory.json is missing outside production", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "omni-config-"))
    process.chdir(tempDir)
    vi.stubEnv("NODE_ENV", "test")

    const { getInventoryConfig } = await import("@/lib/collect/config")
    const config = getInventoryConfig()

    expect(config.gitlab.projects).toEqual([])
    expect(config.vms).toEqual([])

    rmSync(tempDir, { recursive: true, force: true })
  })

  it("fails fast in production when inventory.json is invalid", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "omni-config-"))
    mkdirSync(path.join(tempDir, "config"))
    writeFileSync(path.join(tempDir, "config", "inventory.json"), "{")
    process.chdir(tempDir)
    vi.stubEnv("NODE_ENV", "production")

    const { getInventoryConfig } = await import("@/lib/collect/config")

    expect(() => getInventoryConfig()).toThrow("Failed to load inventory config")

    rmSync(tempDir, { recursive: true, force: true })
  })
})
