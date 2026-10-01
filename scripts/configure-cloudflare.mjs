import { writeFileSync } from "node:fs";
import { createCloudflareConfig } from "./cloudflare-build.mjs";

const databaseId = process.argv[2];
const workerName = process.argv[3] ?? "fjordfall";
writeFileSync("wrangler.cloudflare.json", JSON.stringify(createCloudflareConfig(databaseId, workerName), null, 2) + "\n");
console.log("Created wrangler.cloudflare.json. Build with pnpm build:cloudflare.");
