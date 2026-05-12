import fs from "fs"
import path from "path"
import { CollectInventoryConfig } from "@/lib/collect/types"

let cachedConfig: CollectInventoryConfig | null = null
const emptyConfig: CollectInventoryConfig = {
  nexus: { url: "" },
  gitlab: { baseUrl: "", projects: [] },
  argocd: { baseUrl: "" },
  kubernetes: { clusterName: "", namespaces: [], appNamespaces: [] },
  vms: [],
}

export function getInventoryConfig(): CollectInventoryConfig {
  if (cachedConfig) {
    return cachedConfig
  }

  const configPath = path.join(process.cwd(), "config", "inventory.json")
  try {
    const fileContent = fs.readFileSync(configPath, "utf-8")
    const config = JSON.parse(fileContent) as CollectInventoryConfig
    cachedConfig = config
    return config
  } catch (error) {
    console.error("Failed to load inventory.json:", error)
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Failed to load inventory config: ${configPath}`)
    }
    // Keep local development usable before config/inventory.json exists.
    return emptyConfig
  }
}
