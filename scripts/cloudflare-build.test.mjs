import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createCloudflareConfig, isCloudflareMode, prepareWorkersBuild } from "./cloudflare-build.mjs";

const uuid = "12345678-1234-4234-8234-123456789abc";
function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), "fjordfall-cloudflare-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const calls = [];
  return { cwd, env: { WORKERS_CI: "1" }, calls };
}
test("Workers Builds uses external configuration; ordinary CI keeps Sites mode", () => {
  assert.equal(isCloudflareMode("production", { WORKERS_CI: "1" }), true);
  assert.equal(isCloudflareMode("production", { CI: "true" }), false);
  assert.equal(isCloudflareMode("cloudflare", {}), true);
});
test("placeholder and malformed UUIDs cannot become production configuration", () => {
  for (const invalid of [undefined, "", "00000000-0000-4000-8000-000000000000", "not-a-uuid"]) {
    assert.throws(() => createCloudflareConfig(invalid), /real D1 database UUID/);
  }
});
test("existing named database is reused and migrated before build", (t) => {
  const f = fixture(t);
  const config = prepareWorkersBuild({ ...f, runWrangler(args) {
    f.calls.push(args);
    return JSON.stringify([{ name: "another-game", uuid: "different" }, { name: "fjordfall-db", uuid }]);
  } });
  assert.equal(config.d1_databases[0].database_id, uuid);
  assert.equal(f.calls.length, 2);
  assert.deepEqual(f.calls[0], ["d1", "list", "--json"]);
  assert.deepEqual(f.calls[1].slice(0, 5), ["d1", "migrations", "apply", "DB", "--remote"]);
  assert.equal(JSON.parse(readFileSync(join(f.cwd, "wrangler.cloudflare.json"))).name, "fjordfall");
});
test("a missing named database is created once, resolved and migrated", (t) => {
  const f = fixture(t);
  let listed = 0;
  const config = prepareWorkersBuild({ ...f, runWrangler(args) {
    f.calls.push(args);
    if (args[1] === "list") return JSON.stringify(listed++ ? [{ name: "fjordfall-db", uuid }] : []);
  } });
  assert.equal(config.d1_databases[0].database_id, uuid);
  assert.deepEqual(f.calls[1], ["d1", "create", "fjordfall-db", "--no-update-config"]);
  assert.equal(f.calls.at(-1)[1], "migrations");
});
test("explicit database identity preserves configured routes without remote discovery", (t) => {
  const f = fixture(t);
  const config = { ...createCloudflareConfig(uuid), routes: [{ pattern: "game.example.com", custom_domain: true }] };
  writeFileSync(join(f.cwd, "wrangler.cloudflare.json"), JSON.stringify(config));
  const result = prepareWorkersBuild({ ...f, runWrangler(args) { f.calls.push(args); } });
  assert.deepEqual(result.routes, config.routes);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0][1], "migrations");
});
test("database overrides are applied before migrations", (t) => {
  const f = fixture(t);
  const config = prepareWorkersBuild({ ...f, env: { ...f.env, CLOUDFLARE_D1_DATABASE_ID: uuid, CLOUDFLARE_WORKER_NAME: "fjordfall-test" }, runWrangler(args) { f.calls.push(args); } });
  assert.equal(config.name, "fjordfall-test");
  assert.equal(f.calls.length, 1);
});
test("invalid explicit configuration fails before remote changes", (t) => {
  const f = fixture(t);
  assert.throws(() => prepareWorkersBuild({ ...f, env: { ...f.env, CLOUDFLARE_D1_DATABASE_ID: "00000000-0000-4000-8000-000000000000" }, runWrangler(args) { f.calls.push(args); } }), /real D1/);
  assert.equal(f.calls.length, 0);
});
test("permission and migration failures abort preparation", (t) => {
  const f = fixture(t);
  assert.throws(() => prepareWorkersBuild({ ...f, runWrangler() { throw new Error("D1 permission denied"); } }), /permission denied/);
  assert.throws(() => prepareWorkersBuild({ ...f, env: { ...f.env, CLOUDFLARE_D1_DATABASE_ID: uuid }, runWrangler() { throw new Error("migration failed"); } }), /migration failed/);
});
test("ordinary CI cannot create remote databases", (t) => {
  const f = fixture(t);
  assert.throws(() => prepareWorkersBuild({ ...f, env: { CI: "true" }, runWrangler(args) { f.calls.push(args); } }), /WORKERS_CI=1/);
  assert.equal(f.calls.length, 0);
});
