import { config } from "dotenv";
config({ path: ".env" });
import { createCollectorRuntime, collectOnce } from "./lib/collect/collector";

async function main() {
  console.log("Starting collection...");
  const runtime = createCollectorRuntime();
  await collectOnce(runtime);
  console.log(JSON.stringify(runtime.snapshot.nexus, null, 2));
  console.log(JSON.stringify(runtime.snapshot.gitlab, null, 2));
}

main().catch(console.error);
