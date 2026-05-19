import { describe, expect, it } from "vitest"

import { badgeVariant, statusColor } from "./utils"

describe("dashboard status helpers", () => {
  it("maps healthy sources to the default badge style", () => {
    expect(badgeVariant("ok")).toBe("secondary")
    expect(statusColor("ok")).toBe("var(--status-ok)")
  })

  it("keeps stale or failed sources visually distinct", () => {
    expect(badgeVariant("down")).toBe("destructive")
    expect(badgeVariant("ok", true)).toBe("outline")
    expect(statusColor("timeout")).toBe("var(--status-warn)")
    expect(statusColor("permission_error")).toBe("var(--status-down)")
  })
})
