"use client"

// Re-exports for backward compatibility.
// Tests import utilities from this path; omni-dashboard.tsx imports panel components.

export { IPAMPanel } from "./ipam/ipam-panel"
export { IPAMScanHistoryPanel } from "./ipam/scan-history"

export {
  countIPAMAddresses,
  ipamAddressButtonLabel,
  scanHistoryCountLabel,
  sortIPAMAddressesByIPv4,
  statusTransitionLabel,
  topIPv4SubnetRows,
  visibleIPAMActions,
} from "./ipam/utils"
