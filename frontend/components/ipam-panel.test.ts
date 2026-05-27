import { describe, expect, it } from "vitest"

import {
  countIPAMAddresses,
  ipamAddressButtonLabel,
  scanHistoryCountLabel,
  sortIPAMAddressesByIPv4,
  statusTransitionLabel,
  topIPv4SubnetRows,
  visibleIPAMActions,
} from "./ipam-panel"
import type {
  IPAMAddress,
  IPAMScanHistory,
  IPAMScanHistoryChange,
  IPAMSubnet,
} from "@/lib/types"

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
    isOverride: false,
    consecutiveFailures: status === "used" ? 0 : 3,
  })

  it("counts active, dead, and offline addresses", () => {
    expect(
      countIPAMAddresses([
        address("1", "subnet-a", "used"),
        address("2", "subnet-a", "offline"),
        address("3", "subnet-a", "free"),
      ])
    ).toEqual({ total: 3, used: 1, offline: 1, free: 1, reserved: 0 })
  })

  it("uses the last octet as the IP button label after removing CIDR", () => {
    expect(ipamAddressButtonLabel("10.0.0.1/32")).toBe(".1")
    expect(ipamAddressButtonLabel("10.0.0.10")).toBe(".10")
  })

  it("sorts addresses by IPv4 numeric order", () => {
    const unsorted: IPAMAddress[] = [
      { ...address("10", "subnet-a", "used"), address: "10.0.0.10/32" },
      { ...address("2", "subnet-a", "used"), address: "10.0.0.2/32" },
      { ...address("1", "subnet-a", "used"), address: "10.0.0.1/32" },
    ]

    expect(
      sortIPAMAddressesByIPv4(unsorted).map((item) => item.address)
    ).toEqual(["10.0.0.1/32", "10.0.0.2/32", "10.0.0.10/32"])
  })

  it("sorts top subnet chart rows by loaded host count", () => {
    expect(
      topIPv4SubnetRows(subnets, {
        "subnet-a": [address("1", "subnet-a", "used")],
        "subnet-b": [
          address("2", "subnet-b", "used"),
          address("3", "subnet-b", "offline"),
        ],
      })
    ).toEqual([
      { id: "subnet-b", name: "Large", cidr: "10.0.1.0/29", hosts: 2 },
      { id: "subnet-a", name: "Small", cidr: "10.0.0.0/30", hosts: 1 },
    ])
  })

  it("formats scan history count labels", () => {
    const completed: IPAMScanHistory = {
      id: "scan-1",
      subnetId: "subnet-a",
      subnetName: "Small",
      subnetCidr: "10.0.0.0/30",
      completedAt: "2026-05-26T00:00:00Z",
      status: "completed",
      total: 3,
      used: 1,
      offline: 1,
      free: 1,
    }
    const failed: IPAMScanHistory = {
      ...completed,
      id: "scan-2",
      status: "failed",
      total: null,
      used: null,
      offline: null,
      free: null,
    }

    expect(scanHistoryCountLabel(completed)).toBe("1 used / 1 offline / 1 free")
    expect(scanHistoryCountLabel(failed)).toBe("Failed")
  })

  it("formats status transition labels", () => {
    const change: IPAMScanHistoryChange = {
      id: "change-1",
      historyId: "scan-1",
      address: "10.0.0.1",
      previousStatus: "free",
      currentStatus: "used",
      previousConsecutiveFailures: 1,
      currentConsecutiveFailures: 0,
    }

    expect(statusTransitionLabel(change)).toBe("free -> used")
  })
})
