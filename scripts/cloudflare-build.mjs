import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const isWorkersBuild = (env) => env.WORKERS_CI === "1";
export const isCloudflareMode = (mode, env) => mode === "cloudflare" || isWorkersBuild(env);

export function validateDatabaseId(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value ?? "") || /^0{8}-/.test(value)) {
    throw new Error("A real D1 database UUID is required; the Sites placeholder cannot be deployed to Cloudflare.");
  }
  return value;
}

export function createCloudflareConfig(databaseId, workerName = "fjordfall", databaseName = "fjordfall-db") {
  validateDatabaseId(databaseId);
  for (const name of [workerName, databaseName]) {
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(name)) {
      throw new Error("Worker and database names must contain lowercase letters, digits and hyphens.");
    }
  }
  return {
    name: workerName,
    main: "vinext/server/fetch-handler",
    compatibility_date: "2026-05-15",
    compatibility_flags: ["nodejs_compat"],
    workers_dev: true,
    d1_databases: [{ binding: "DB", database_name: databaseName, database_id: databaseId, migrations_dir: "drizzle" }],
  };
}

// Called only by Workers Builds. Local/Actions builds never create remote data.
export function prepareWorkersBuild({ cwd, env, runWrangler }) {
  if (!isWorkersBuild(env)) throw new Error("Remote database preparation requires WORKERS_CI=1.");
  const configPath = resolve(cwd, "wrangler.cloudflare.json");
  const previous = existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8")) : {};
  const binding = previous.d1_databases?.find((entry) => entry.binding === "DB");
  const databaseName = env.CLOUDFLARE_D1_DATABASE_NAME ?? binding?.database_name ?? "fjordfall-db";
  const workerName = env.CLOUDFLARE_WORKER_NAME ?? previous.name ?? "fjordfall";
  let databaseId = env.CLOUDFLARE_D1_DATABASE_ID ?? binding?.database_id;
  // Validate names before making any remote resource calls.
  createCloudflareConfig("11111111-1111-4111-8111-111111111111", workerName, databaseName);
  if (databaseId !== undefined) validateDatabaseId(databaseId);
  if (!databaseId) {
    const lookup = () => {
      const rows = JSON.parse(runWrangler(["d1", "list", "--json"], true));
      if (!Array.isArray(rows)) throw new Error("Wrangler returned an invalid database list.");
      const matches = rows.filter((row) => row.name === databaseName);
      if (matches.length > 1) throw new Error(`Multiple D1 databases named ${databaseName}; set CLOUDFLARE_D1_DATABASE_ID explicitly.`);
      return matches[0]?.uuid;
    };
    databaseId = lookup();
    if (!databaseId) {
      runWrangler(["d1", "create", databaseName, "--no-update-config"]);
      databaseId = lookup();
    }
    validateDatabaseId(databaseId);
  }
  const config = { ...previous, ...createCloudflareConfig(databaseId, workerName, databaseName) };
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  runWrangler(["d1", "migrations", "apply", "DB", "--remote", "--config", configPath]);
  return config;
}
