import type {
  IPAMAddress,
  IPAMScanHistory,
  IPAMScanHistoryChange,
  IPAMSubnet,
} from "@/lib/types"
import type { AddressIndex } from "./types"

export function visibleIPAMActions(canManage: boolean) {
  return {
    create: canManage,
    update: canManage,
    delete: canManage,
    rescan: canManage,
    editAddress: canManage,
  }
}

export function countIPAMAddresses(addresses: IPAMAddress[]) {
  return addresses.reduce(
    (acc, address) => {
      acc.total += 1
      acc[address.status] += 1
      return acc
    },
    { total: 0, used: 0, offline: 0, free: 0, reserved: 0 }
  )
}

export function topIPv4SubnetRows(
  subnets: IPAMSubnet[],
  addressesBySubnet: AddressIndex,
  limit = 5
) {
  return subnets
    .map((subnet) => ({
      id: subnet.id,
      name: subnet.name,
      cidr: subnet.cidr,
      hosts: addressesBySubnet[subnet.id]?.length ?? 0,
    }))
    .sort((a, b) => b.hosts - a.hosts)
    .slice(0, limit)
}

function stripCIDRSuffix(address: string) {
  return address.split("/")[0]
}

function ipv4SortKey(address: string) {
  const parts = stripCIDRSuffix(address).split(".").map(Number)
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return null
  }
  return parts.reduce((acc, part) => acc * 256 + part, 0)
}

export function ipamAddressButtonLabel(address: string) {
  const hostAddress = stripCIDRSuffix(address)
  const lastOctet = hostAddress.split(".").at(-1)
  return lastOctet ? `.${lastOctet}` : hostAddress
}

export function sortIPAMAddressesByIPv4(addresses: IPAMAddress[]) {
  return [...addresses].sort((a, b) => {
    const left = ipv4SortKey(a.address)
    const right = ipv4SortKey(b.address)
    if (left !== null && right !== null) {
      return left - right
    }
    if (left !== null) return -1
    if (right !== null) return 1
    return a.address.localeCompare(b.address)
  })
}

export function scanHistoryCountLabel(history: IPAMScanHistory) {
  if (history.status === "failed") {
    return "Failed"
  }
  return `${history.used ?? 0} used / ${history.offline ?? 0} offline / ${history.free ?? 0} free`
}

export function statusTransitionLabel(change: IPAMScanHistoryChange) {
  return `${change.previousStatus} -> ${change.currentStatus}`
}
