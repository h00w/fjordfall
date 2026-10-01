import { writeFileSync } from "node:fs";

const databaseId = process.argv[2];
const workerName = process.argv[3] ?? "fjordfall";
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(databaseId ?? "") || /^0{8}-/.test(databaseId)) {
  throw new Error("Provide the database UUID printed by wrangler d1 create fjordfall-db.");
}
if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(workerName)) {
  throw new Error("Worker name must contain lowercase letters, digits and hyphens.");
}
writeFileSync("wrangler.cloudflare.json", JSON.stringify({
  name: workerName,
  main: "vinext/server/fetch-handler",
  compatibility_date: "2026-05-15",
  compatibility_flags: ["nodejs_compat"],
  workers_dev: true,
  d1_databases: [{
    binding: "DB",
    database_name: "fjordfall-db",
    database_id: databaseId,
    migrations_dir: "drizzle",
  }],
}, null, 2) + "\n");
console.log("Created wrangler.cloudflare.json. Build with pnpm build:cloudflare.");
