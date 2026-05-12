import { NextResponse } from "next/server"

import { getInventoryConfig } from "@/lib/collect/config"

export function GET() {
  try {
    getInventoryConfig()
    return NextResponse.json({ status: "ok" })
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Inventory config is not ready.",
      },
      { status: 500 }
    )
  }
}
