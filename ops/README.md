# Server operations (Mini App only)

Two manual GitHub Actions workflows reach the production server over SSH. Each uses its own key, and the server
allows each key to run exactly one script (`command="…",restrict` in `/root/.ssh/authorized_keys`).

| Workflow | Server script (repo copy) | Installed as | Key secret |
|---|---|---|---|
| Server check (`.github/workflows/server-check.yml`) | `ops/server/warphub-check` — read-only | `/usr/local/bin/warphub-check` | `SERVER_SSH_KEY` |
| Deploy (`.github/workflows/deploy.yml`) | `ops/server/warphub-deploy` | `/usr/local/bin/warphub-deploy` | `DEPLOY_SSH_KEY` |

Shared secrets: `SERVER_HOST`, `SERVER_KNOWN_HOSTS` (pinned host key). Deploy also needs `CLIENT_ENV`
(the production client `.env`, must contain `VITE_EXECUTION_CONFIG=production`).
Output goes to the issues "Server check" and "Deploys".

## Production layout (verified 2026-10-23 with the server check)

- Backend: `/var/www/warphub.ru/server-new`, PM2 process `warphub-api` (`bun run src/index.ts`), Bun 1.3.14.
  `/var/www/warphub.ru/server` is an unused old copy.
- Roster data: `/var/www/warphub.ru/server-new/roster-data` (read per request; no restart needed for data).
- Mini App: `/var/www/warphub.ru/client/dist` (Nginx root of `warphub.ru`; `/api` → `127.0.0.1:4000`).
- Other sites share the server (`reflectahome.ru`, `questa-ekb.online`, PM2 `reflecta:3000`): never touched.

## Deploy workflow

Inputs: `mode` (`dry-run`, `apply`, `rollback`, `list`), `parts` (`data`, `client`, `backend` combinations),
`ref` (apply only for commits on `main`), `migrate` (needs `backend`; dumps the database first), `rollback_id`.

`warphub-deploy`:
1. accepts only the fixed command forms above; refuses if PM2's `warphub-api` does not run from `server-new`;
2. verifies the package (allowed paths only, SHA-256 of every file) and free disk space;
3. `dry-run`: lists what would change and stops;
4. `apply`: copies the parts it will replace to `/root/warphub-backup/deploy-<id>` (plus a database dump when
   migrating), installs only the chosen parts (backend: `src`, `drizzle`, `package.json`, `bun.lock`,
   `tsconfig.json`, `drizzle.config.ts`, `env.d.ts`; `.env` and `node_modules` stay), runs `bun install` only if
   `bun.lock` changed, migrations only if asked, restarts `warphub-api` only for backend changes;
5. health checks (`/health`, `/roster/access` = 401, `index.html`, data checksum); on failure it puts the backup back;
6. keeps the last 5 deploy backups.

`rollback <id>` restores the files saved by that deploy (a database dump is never restored automatically).
