# Fjordfall: The Dragon Hunt — host it outside ChatGPT Sites

Yes. This source package can run independently on your own Cloudflare account, using Workers for the web app/API and D1 for persistent multiplayer state. It does not require ChatGPT Sites authentication in the `cloudflare` build mode. Use Node.js 24 and pnpm 11.25.0.

The ZIP contains the full source, artwork, public assets, dependency lockfile, SQL migrations and this guide. Install dependencies locally; `node_modules`, credentials, generated build files and live game data are excluded.

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
- https://developers.cloudflare.com/d1/reference/migrations/
- https://developers.cloudflare.com/workers/configuration/routing/custom-domains/

Prepared 2026-10-01. Source: https://github.com/h00w/fjordfall
