# WarpHub deployment guide

How changes reach the live Mini App. Since 23 Oct 2026 deployment runs through GitHub Actions; the one-time
setup (keys, scripts, secrets) is described in [`ops/README.md`](../ops/README.md).

Nothing in this guide touches the other sites on the same server (`reflectahome.ru`, `questa-ekb.online`,
PM2 `reflecta:3000`). Never deploy without the owner's explicit permission.

---

## 1. What runs where (verified on the server, 23 Oct 2026)

| Part | Server path | Notes |
|---|---|---|
| Backend (API) | `/var/www/warphub.ru/server-new` | PM2 process `warphub-api`, started as `bun run src/index.ts`, Bun 1.3.14, port 4000 |
| Roster data | `/var/www/warphub.ru/server-new/roster-data` | read per request — no restart needed after a data update |
| Mini App | `/var/www/warphub.ru/client/dist` | Nginx root of `warphub.ru`; `/api` is proxied to `127.0.0.1:4000` |
| Database, file storage | Docker containers `postgres`, `aistor-server` (MinIO) | migrations in `backend/drizzle` |
| Backend settings | `/var/www/warphub.ru/server-new/.env` | never in git; names in `backend/.env.example` |
| Mini App build settings | GitHub secret `CLIENT_ENV` (copy of the production client `.env`) | must contain `VITE_EXECUTION_CONFIG=production` |

`/var/www/warphub.ru/server` is an old, unused copy — do not deploy there.

---

## 2. Normal deployment (GitHub Actions)

Only commits that are on `main` can be installed. The usual flow: work branch → pull request → CI passes →
merge into `main` → deploy.

1. GitHub → **Actions** → **Deploy** → **Run workflow**.
2. Choose:
   - `mode`: **`dry-run`** first (shows what would change, installs nothing), then **`apply`**;
   - `parts`: what to update —
     - `data` — roster data (40K and AoS); no restart;
     - `client` — the Mini App; users get it the next time they open the app;
     - `backend` — API code; restarts `warphub-api` (a few seconds of downtime);
   - `ref`: `main` (or a commit on `main`);
   - `migrate`: only when the change adds a database migration (needs `backend`; a database dump is taken first).
3. Read the result in the issue **"Deploys"** (#8): every run adds a comment with the server output.
   `apply` ends with `DEPLOY OK — id <id>`.

What the server script does on `apply`: checks the package (allowed paths, SHA-256 of every file) → copies the
parts it will replace to `/root/warphub-backup/deploy-<id>` → installs only the chosen parts (`.env` and
`node_modules` are never replaced; `bun install` only if `bun.lock` changed) → runs health checks
(`/health`, `/roster/access` = 401, `index.html`, data checksum) → **puts the backup back automatically** if a
check fails. The last 5 deploy backups are kept.

### Roll back

1. **Deploy** → `mode`: `list` — the issue shows the deploy ids.
2. **Deploy** → `mode`: `rollback`, `rollback_id`: the id (e.g. `20261022-212747`).

A database dump taken before a migration is never restored automatically; its path is in the deploy output.

### Check what is running

GitHub → **Actions** → **Server check** → **Run workflow**. The output (data and code fingerprints, Mini App
build, PM2, migrations, Nginx, ports, disk) appears in the issue **"Server check"** (#5). It changes nothing.

### After a deploy

- Close and reopen the Mini App in Telegram (Telegram caches it). Roster data can stay cached in an open app
  for up to an hour.
- For roster data: Roster Builder → the system → a faction → check a changed value.

---

## 3. Manual fallback (only if GitHub Actions is unavailable)

Commands marked **PC** run in PowerShell on your computer; commands marked **server** run after
`ssh root@<server-ip>`.

1. **PC** — build the packages from the commit to deploy (needs git; the client build needs `bun` and the
   production client `.env`):
   ```bash
   git archive --format=zip -o warphub-roster-data.zip <commit>:backend/roster-data
   git archive --format=zip -o warphub-client-src.zip <commit>:client
   ```
   then upload with `scp -i <your key> <file> root@<server-ip>:/root/`.
2. **server** — back up what you replace:
   ```bash
   mkdir -p /root/warphub-backup/manual-$(date +%F)
   cp -a /var/www/warphub.ru/server-new/roster-data /root/warphub-backup/manual-$(date +%F)/roster-data
   cp -a /var/www/warphub.ru/client/dist /root/warphub-backup/manual-$(date +%F)/client-dist
   ```
3. **server** — roster data: unzip into a new folder and swap it in:
   ```bash
   rm -rf /root/rd-new && mkdir /root/rd-new && unzip -q /root/warphub-roster-data.zip -d /root/rd-new
   rm -rf /var/www/warphub.ru/server-new/roster-data && mv /root/rd-new /var/www/warphub.ru/server-new/roster-data
   ```
4. **server** — Mini App: unzip the client source into a fresh folder, add the production client `.env`, then
   `bun install && bun run build`, and copy `dist/.` into `/var/www/warphub.ru/client/dist/` (empty that folder
   first, keep the folder itself).
5. **server** — backend code (only if it changed): copy `src`, `drizzle`, `package.json`, `bun.lock`,
   `tsconfig.json`, `drizzle.config.ts`, `env.d.ts` into `/var/www/warphub.ru/server-new` (never `.env` or
   `node_modules`), `bun install --frozen-lockfile` if `bun.lock` changed, `bun run db:migrate` only for new
   migrations (after `docker exec postgres pg_dump -U postgres postgres > /root/warphub-backup/db-$(date +%F).sql`),
   then `pm2 restart warphub-api`.
6. **server** — check: `curl -s http://127.0.0.1:4000/health` → `{"ok":true}`;
   `pm2 logs warphub-api --lines 50 --nostream` has no errors.
7. Roll back by copying the backup folders back.

---

## 4. Settings you can change without a deploy

Edit `/var/www/warphub.ru/server-new/.env`, then `pm2 restart warphub-api`.

| What | Setting |
|---|---|
| Extra admins (Telegram IDs, comma-separated) | `ADMIN_TELEGRAM_IDS` |
| Bot notifications off (e.g. on a test server) | `TELEGRAM_NOTIFICATIONS=off` |
| Who can create Roster Builder access codes | `ROSTER_ADMIN_TELEGRAM_IDS` |
| Access-code lifetime, hours (default 24) | `ROSTER_CODE_TTL_HOURS` |

In the app (no restart): D&D games (Admin → D&D), mini-game rewards and card packs (Admin → Награды →
Настройки), players' card points (Admin → Награды → Очки игроков), Roster Builder access codes
(Admin → «Ростеры»).

Updating roster data from a new Wahapedia export: `tools/roster-data/README.md`, then a pull request and a
`data` deploy.
