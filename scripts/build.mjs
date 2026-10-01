import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { isWorkersBuild, prepareWorkersBuild } from "./cloudflare-build.mjs";

const cwd = process.cwd();
const external = isWorkersBuild(process.env);
if (external) {
  console.log("Cloudflare Workers Builds detected: preparing Fjordfall D1 and independent hosting.");
  try {
    prepareWorkersBuild({ cwd, env: process.env, runWrangler(args, capture = false) {
      const result = spawnSync(process.execPath, [resolve(cwd, "node_modules/wrangler/bin/wrangler.js"), ...args], {
        cwd,
        env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
        encoding: "utf8",
        stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit",
      });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(`Wrangler ${args.slice(0, 3).join(" ")} failed.`);
      return result.stdout;
    } });
  } catch (error) {
    console.error("Fjordfall database setup failed:", error.message);
    console.error("The Workers Builds API token needs Account > D1 > Edit. An existing database can be selected with CLOUDFLARE_D1_DATABASE_ID in Build variables. See EXTERNAL_HOSTING.md.");
    process.exit(1);
  }
}
const result = spawnSync(process.execPath, [resolve(cwd, "node_modules/vinext/dist/cli.js"), "build", ...(external ? ["--mode", "cloudflare"] : [])], { cwd, stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
