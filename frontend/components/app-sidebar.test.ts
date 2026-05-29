import { describe, expect, it } from "vitest"

import { ipamItems } from "./app-sidebar"
import { sourceOrder } from "./dashboard/lib/constants"

describe("ipam sidebar items", () => {
  it("exposes scan history below home", () => {
    expect(ipamItems.map((item) => item.view)).toEqual([
      "ipam-home",
      "ipam-scan-history",
    ])
  })
})

describe("dashboard source sidebar order", () => {
  it("places GitHub directly below GitLab", () => {
    expect(
      sourceOrder.slice(
        sourceOrder.indexOf("gitlab"),
        sourceOrder.indexOf("gitlab") + 2
      )
    ).toEqual(["gitlab", "github"])
  })
})
