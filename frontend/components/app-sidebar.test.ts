import { describe, expect, it } from "vitest"

import { ipamItems } from "./app-sidebar"

describe("ipam sidebar items", () => {
  it("exposes scan history below home", () => {
    expect(ipamItems.map((item) => item.view)).toEqual([
      "ipam-home",
      "ipam-scan-history",
    ])
  })
})
