import { describe, expect, it } from "vitest"

import {
  countIPAMAddresses,
  ipamAddressButtonLabel,
  sortIPAMAddressesByIPv4,
  topIPv4SubnetRows,
  visibleIPAMActions,
} from "./ipam-panel"
import type { IPAMAddress, IPAMSubnet } from "@/lib/types"

describe("visibleIPAMActions", () => {
  it("hides admin-only actions for viewers", () => {
    expect(visibleIPAMActions(false)).toEqual({
      create: false,
      update: false,
      delete: false,
      rescan: false,
      editAddress: false,
    })
  })

  it("shows admin-only actions for admins", () => {
    expect(visibleIPAMActions(true)).toEqual({
      create: true,
      update: true,
      delete: true,
      rescan: true,
      editAddress: true,
    })
  })
})

describe("IPAM helpers", () => {
  const subnets: IPAMSubnet[] = [
    {
      id: "subnet-a",
      networkId: "network-1",
      locationId: "location-1",
      name: "Small",
      cidr: "10.0.0.0/30",
      autoDiscovery: true,
      scanIntervalSeconds: 3600,
    },
    {
      id: "subnet-b",
      networkId: "network-1",
      locationId: "location-1",
      name: "Large",
      cidr: "10.0.1.0/29",
      autoDiscovery: true,
      scanIntervalSeconds: 3600,
    },
  ]

  const address = (
    id: string,
    subnetId: string,
    status: IPAMAddress["status"]
  ): IPAMAddress => ({
    id,
    subnetId,
    address: `10.0.0.${id}`,
    status,
    consecutiveFailures: status === "active" ? 0 : 3,
  })

  it("counts active, dead, and offline addresses", () => {
    expect(
      countIPAMAddresses([
        address("1", "subnet-a", "active"),
        address("2", "subnet-a", "dead"),
        address("3", "subnet-a", "offline"),
      ])
    ).toEqual({ total: 3, active: 1, dead: 1, offline: 1 })
  })

  it("uses the last octet as the IP button label after removing CIDR", () => {
    expect(ipamAddressButtonLabel("10.0.0.1/32")).toBe(".1")
    expect(ipamAddressButtonLabel("10.0.0.10")).toBe(".10")
  })

  it("sorts addresses by IPv4 numeric order", () => {
    const unsorted: IPAMAddress[] = [
      { ...address("10", "subnet-a", "active"), address: "10.0.0.10/32" },
      { ...address("2", "subnet-a", "active"), address: "10.0.0.2/32" },
      { ...address("1", "subnet-a", "active"), address: "10.0.0.1/32" },
    ]

    expect(
      sortIPAMAddressesByIPv4(unsorted).map((item) => item.address)
    ).toEqual(["10.0.0.1/32", "10.0.0.2/32", "10.0.0.10/32"])
  })

  it("sorts top subnet chart rows by loaded host count", () => {
    expect(
      topIPv4SubnetRows(subnets, {
        "subnet-a": [address("1", "subnet-a", "active")],
        "subnet-b": [
          address("2", "subnet-b", "active"),
          address("3", "subnet-b", "dead"),
        ],
      })
    ).toEqual([
      { id: "subnet-b", name: "Large", cidr: "10.0.1.0/29", hosts: 2 },
      { id: "subnet-a", name: "Small", cidr: "10.0.0.0/30", hosts: 1 },
    ])
  })
})
