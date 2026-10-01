# Fjordfall: The Dragon Hunt — host it outside ChatGPT Sites

Yes. This source package can run independently on your own Cloudflare account, using Workers for the web app/API and D1 for persistent multiplayer state. It does not require ChatGPT Sites authentication in the `cloudflare` build mode. Use Node.js 24 and pnpm 11.25.0.

The ZIP contains the full source, artwork, public assets, dependency lockfile, SQL migrations and this guide. Install dependencies locally; `node_modules`, credentials, generated build files and live game data are excluded.

## Cloudflare dashboard Git deployment (fix for error 10181)

If your log says `D1 binding 'DB' references database '00000000-0000-4000-8000-000000000000' which was not found`, the build used the Sites preview database. The repository now detects Cloudflare Workers Builds through its `WORKERS_CI=1` environment variable and uses independent Cloudflare configuration automatically.

In Cloudflare, open **Workers & Pages → fjordfall → Settings → Build**. Use:

| Setting | Value |
| --- | --- |
| Repository | `h00w/fjordfall` |
| Production branch | `main` |
| Root directory | Repository root (leave blank or `/`) |
| Build command | `pnpm run build` |
| Deploy command | `npx wrangler deploy` |

The standard build finds the D1 database named `fjordfall-db` in your account, or creates it when missing. It writes the actual UUID to `wrangler.cloudflare.json`, applies the SQL migrations remotely, and builds the game without Sites middleware. Wrangler's generated deployment configuration points at that actual database. Existing `fjordfall-db` data is retained; migrations are tracked and only pending migrations run.

**One-time permission requirement:** the Workers Builds API token must have **Account → D1 → Edit** for the account containing your Worker. Go to **My Profile → API Tokens**, edit the token selected in your Worker's build settings, and add this permission. Cloudflare's automatically generated build token may not include D1 access. Keep the token in Cloudflare; never commit or paste it into this repository.

If you already have another database, add the build variable `CLOUDFLARE_D1_DATABASE_ID` with its real UUID (and optionally `CLOUDFLARE_D1_DATABASE_NAME` with its name). Set these under **Build Variables and Secrets**, so the build process can read them. These are database identities, not API tokens. Do not use the all-zero placeholder. `CLOUDFLARE_WORKER_NAME` optionally overrides `fjordfall`.

Save the settings and retry the deployment using the latest `main` commit. Then open your actual URL, e.g. `https://fjordfall.hendar-rise.workers.dev`, create a room and join in a second browser.

The steps below remain available for local development and manual CLI deployment.

## 1. Download and install

Extract the ZIP and open a terminal in its `fjordfall` directory (the directory with `package.json`). Alternatively clone https://github.com/h00w/fjordfall.

```bash
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
```

## 2. Create your Cloudflare database

Sign in to your own Cloudflare account. These commands create resources in that account; check its current Workers and D1 limits/pricing before deployment.

```bash
pnpm exec wrangler login
pnpm exec wrangler d1 create fjordfall-db
```

Copy the `database_id` UUID printed by the second command. Replace `YOUR_DATABASE_UUID` below with that exact UUID, without angle brackets:

```bash
pnpm configure:cloudflare YOUR_DATABASE_UUID
```

This creates an ignored `wrangler.cloudflare.json` with Worker name `fjordfall`, D1 binding `DB`, database name `fjordfall-db`, and migration directory `drizzle`. For a different Worker name, append it to the configure command, e.g. `pnpm configure:cloudflare YOUR_DATABASE_UUID fjordfall-production`. If the database name already exists, use its existing UUID or create another name and update `database_name` in the generated JSON. Do not run the configure command again after customizing that file unless you intend to replace it.

## 3. Test locally

```bash
pnpm exec wrangler d1 migrations apply fjordfall-db --local --config wrangler.cloudflare.json
pnpm dev:cloudflare
```

Open the local URL printed by Vite. Create a room and join its invite in a second browser. Confirm both players see the same roster and can start the hunt. Stop the server with Ctrl+C.

## 4. Build and deploy

Apply migrations to your remote database before launching the Worker:

```bash
pnpm exec wrangler d1 migrations apply fjordfall-db --remote --config wrangler.cloudflare.json
pnpm build:cloudflare
pnpm exec wrangler deploy --dry-run --config dist/server/wrangler.json
pnpm deploy:cloudflare
```

Deploy the generated `dist/server/wrangler.json`, which includes the compiled Worker and client assets. Do not deploy the source config directly. Wrangler prints your actual `https://fjordfall.YOUR_SUBDOMAIN.workers.dev` URL; the subdomain depends on your account. No external deployment has been performed while preparing this package.

For future updates, install from the lockfile, run checks, apply any new remote migrations, rebuild in Cloudflare mode, and deploy again. Never apply the local test UUID to a production deployment.

## 5. Add your domain

You can keep hendarmawan.se on its current host and use `fjordfall.hendarmawan.se` for the game. The domain must be an active zone in your Cloudflare account for a Workers Custom Domain.

After deployment, go to Cloudflare → Workers & Pages → your `fjordfall` Worker → Settings → Domains & Routes → Add → Custom Domain. Enter `fjordfall.hendarmawan.se`. Cloudflare manages DNS and HTTPS for that hostname. Resolve any existing CNAME conflict before adding it; preserve the website's existing apex and www records.

If configuring the domain in code, add this top-level entry to `wrangler.cloudflare.json`, then rebuild and redeploy:

```json
"routes": [{ "pattern": "fjordfall.hendarmawan.se", "custom_domain": true }]
```

Update your portfolio's game iframe/demo URL to the actual deployed hostname when ready. The home card's GitHub link stays https://github.com/h00w/fjordfall.

## Your existing hosting: compatibility

| Hosting | Can this package run unchanged? | What is needed? |
| --- | --- | --- |
| Your Cloudflare Workers + D1 account | Yes, in Cloudflare mode | Configure DB, migrate, build and deploy as above |
| cPanel/shared hosting/GitHub Pages/static file hosting | No | A static upload cannot run `/api/game` or D1; host the full game on Cloudflare and link/embed it |
| VPS/Docker/Render/Vercel/another Node host | No | Port the D1 storage adapter and `cloudflare:workers` binding to that host's database/runtime before deployment |

Keeping your portfolio on your existing host and linking/embedding the Cloudflare game is the smallest change. A complete move to another runtime requires backend development and database integration, not just copying the ZIP into `public_html`.

## Data and verification checklist

- [ ] Worker and D1 belong to your account; generated config contains your real database UUID.
- [ ] All five SQL migrations applied to the remote database.
- [ ] Create a room, join on another device, start Slow/Medium/Hard, verify synchronized combat.
- [ ] Kill a monster: level-up popup and +2 HP; test realm gates, revives, PvP and replay.
- [ ] HTTPS invite links stay on your deployed hostname.
- [ ] Check Worker logs and D1 usage after a multiplayer session.
- [ ] If preserving existing rooms/scores, export the existing host's database through its supported access and import separately before switching players. This package starts with a new empty database; it contains no live data or credentials.

The package was checked with typecheck, game regression tests, an independent Cloudflare production build, local D1 migrations, and Wrangler deployment dry-run. A remote deployment still needs your account login and actual database ID.

## Official references

- https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- https://developers.cloudflare.com/workers/vite-plugin/reference/api/
- https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- https://developers.cloudflare.com/d1/reference/migrations/
- https://developers.cloudflare.com/workers/configuration/routing/custom-domains/

Prepared 2026-10-01. Source: https://github.com/h00w/fjordfall
