import type {
  IPAMAddress,
  IPAMLocation,
  IPAMNetwork,
  IPAMSubnet,
} from "@/lib/types"

export type ResourceKind = "location" | "network" | "subnet"
export type AddressIndex = Record<string, IPAMAddress[]>

export type ResourceSheet =
  | { kind: "location"; item?: IPAMLocation }
  | { kind: "network"; item?: IPAMNetwork }
  | { kind: "subnet"; item?: IPAMSubnet }

export type DeleteTarget =
  | { kind: "location"; item: IPAMLocation }
  | { kind: "network"; item: IPAMNetwork }
  | { kind: "subnet"; item: IPAMSubnet }

export type ResourceFormState = {
  locationId: string
  networkId: string
  name: string
  cidr: string
  description: string
  autoDiscovery: boolean
  scanIntervalSeconds: number
}
