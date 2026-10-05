# WarpHub update — deployment guide

This guide installs the new version on your existing server. It only touches
WarpHub: the `warphub-backend` folder, the client build, and the WarpHub
database. Nothing else on the server is changed.

Time needed: about 30–45 minutes. Do it when the club is quiet (for example,
a weekday morning). Users may see errors for 1–2 minutes during the restart.

**If anything goes wrong, stop and go to section 9 ("Rolling back").**

---

## 0. Before you start

You need:

- **SSH access to the server** (login and password, or a key), and a program
  to copy files. On Windows, **WinSCP** (copy files) and **PuTTY** or
  **Windows Terminal** (run commands) are fine.
- The two ZIP files: `warphub-backend-updated.zip` and `warphub-client-updated.zip`.
- **@KorenevEgor's Telegram ID** (a number). The easiest way: open the Mini App
  → **Профиль** — the **Telegram ID** row shows it. @KorenevEgor must also press
  **Start** in @WarpHubBot once, otherwise the bot can't message him.

In the commands below, text in `<angle brackets>` must be replaced with your
own values. Lines starting with `#` are comments — don't type them.

---

## 1. Connect to the server

```bash
ssh <user>@<server-address>
```

---

## 2. Find where WarpHub lives

```bash
# The backend process and its folder:
pm2 list
pm2 describe <backend-process-name> | grep -E "exec cwd|script path"
```

Write down the **exec cwd** — this is the backend folder, called
`<BACKEND_DIR>` below.

```bash
# The folder Nginx serves the Mini App from:
grep -RnE "server_name|root " /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null
```

Find the block for your Mini App domain and its `root ...;` line — this is
`<CLIENT_WEB_DIR>` (often something like `/var/www/warphub` or `.../client/dist`).

```bash
# The database container and database name:
docker ps --format "table {{.Names}}\t{{.Image}}"
grep POSTGRES_URI <BACKEND_DIR>/.env
```

`POSTGRES_URI` looks like `postgresql://<db-user>:<password>@<host>:5432/<db-name>`.
The container with `postgres` in its image is `<PG_CONTAINER>`.

---

## 3. Back up everything (don't skip this)

```bash
mkdir -p ~/warphub-backup
# Database
docker exec <PG_CONTAINER> pg_dump -U <db-user> <db-name> > ~/warphub-backup/db-$(date +%F).sql
ls -lh ~/warphub-backup/        # the .sql file must not be 0 bytes
# Code
cp -a <BACKEND_DIR> ~/warphub-backup/backend
cp -a <CLIENT_WEB_DIR> ~/warphub-backup/client-web
```

---

## 4. Check existing bookings that the update affects

The update hides the **third table** and turns D&D table booking into D&D games.
Upcoming bookings on those stay in the database but won't be visible to users.
See whether there are any:

```bash
docker exec -i <PG_CONTAINER> psql -U <db-user> <db-name> <<'SQL'
SELECT r.id, s.slug, t.name AS table, u.first_name, u.username, r.starts_at
FROM reservations r
JOIN services s ON s.id = r.service_id
JOIN users u ON u.id = r.user_id
LEFT JOIN tables t ON t.id = r.table_id
WHERE r.status IN ('pending','confirmed') AND r.starts_at > now()
  AND (r.table_id NOT IN (SELECT id FROM tables WHERE is_active ORDER BY id LIMIT 2)
       OR s.slug = 'dnd_game')
ORDER BY r.starts_at;
SQL
```

If rows appear, write them down and contact those people (or move them to
table 1/2 later in the admin panel). Empty output means nothing to do.

---

## 5. Install the new backend

1. Stop the backend for a moment:
   ```bash
   pm2 stop <backend-process-name>
   ```
2. Copy the contents of `warphub-backend-updated.zip` into `<BACKEND_DIR>`,
   **replacing** files. With WinSCP, unzip on your computer and drag the
   contents into the folder. **Don't delete** `.env` or `node_modules` on the
   server; the ZIP contains neither.
3. Add settings to `<BACKEND_DIR>/.env` (open with `nano <BACKEND_DIR>/.env`,
   add the lines at the end, save with Ctrl+O, Enter, exit with Ctrl+X):
   ```
   # Extra admins (comma-separated Telegram IDs). The two existing admins stay.
   ADMIN_TELEGRAM_IDS=<KorenevEgor's Telegram ID>
   ```
4. Install libraries, update the database, run the tests:
   ```bash
   cd <BACKEND_DIR>
   bun install
   bun run db:migrate
   bun test
   ```
   - `db:migrate` should finish without red errors.
   - `bun test` should end with `25 pass` and `0 fail`.
5. Start it again and watch the log for 20–30 seconds:
   ```bash
   pm2 start <backend-process-name>
   pm2 logs <backend-process-name> --lines 50
   ```
   You should see `Warphub API is running at ...` and no red errors.
   > If PM2 runs the backend with `bun run build` / `dist/index.js` and that
   > fails: the `scripts/build.ts` file was missing from the developer's
   > archive. Starting with `bun run src/index.ts` works the same way:
   > `pm2 delete <name> && pm2 start "bun run src/index.ts" --name <name> --cwd <BACKEND_DIR> && pm2 save`.
   Press Ctrl+C to leave the log (the backend keeps running).
6. Quick checks (`4000` is the `PORT` from `.env`):
   ```bash
   curl -s http://127.0.0.1:4000/health
   curl -s http://127.0.0.1:4000/booking-options | head -c 200; echo
   curl -s http://127.0.0.1:4000/dnd/games; echo
   ```
   Expected: `{"ok":true}`, some JSON with `experienceLevels`, and `[]`.

If step 4 or 5 shows errors, copy the red text and send it to me — or roll
back (section 9).

---

## 6. Install the new client (Mini App screens)

> **Don't reuse an old `node_modules` folder.** The client archive the
> developer sent contained `node_modules` built on Windows; those can't build
> on a Linux server. `bun install` below downloads the right ones.

The client must be **built** (turned into ready web files) before Nginx can
serve it.

```bash
mkdir -p ~/warphub-client-src
# copy the contents of warphub-client-updated.zip into ~/warphub-client-src (WinSCP),
# and copy your existing client .env file there too (it holds the API address)
cd ~/warphub-client-src
ls -a        # .env must be in the list
grep VITE_EXECUTION_CONFIG .env   # must say: VITE_EXECUTION_CONFIG=production
bun install
bun run build
ls dist      # index.html and an assets folder must be here
```

Then publish the build:

```bash
rm -rf <CLIENT_WEB_DIR>/*
cp -a dist/. <CLIENT_WEB_DIR>/
```

No Nginx restart is needed.

> If the client was previously built on another computer (not on the server),
> run the same `bun install` and `bun run build` there, then upload the `dist`
> folder contents to `<CLIENT_WEB_DIR>`.

---

## 7. Check in Telegram

Close and reopen the Mini App (Telegram caches it — pull to refresh, or
restart Telegram if you see the old version).

- [ ] Warhammer → Игра: Monday–Thursday can't be selected; only 2 slots appear.
- [ ] Book a game (army, points, experience). You (as admin) get a bot message "стол ждёт соперника (1/2)".
- [ ] From a second account: the game shows under "Ищут соперника" with your army → Присоединиться → 2/2. The first account gets a bot message.
- [ ] Покраска миниатюр: shows "Занято N из 5", asks faction, model, paints, help.
- [ ] D&D shows "Хочу попробовать" and "Игры по расписанию".
- [ ] Admin → **D&D** → Новая игра: create the 3 games (title, type, date, time, places, picture, status "Запись открыта"). They appear for users.
- [ ] Admin → **Столы WH** shows the day's tables with 1/2 games highlighted.
- [ ] Мои записи shows the bookings and lets you edit army/points/experience.
- [ ] A booking for Monday sent manually is rejected (the server checks this, not just the screen).

---

## 8. Settings you can change later without code

| What | Where |
|---|---|
| Admins | `ADMIN_TELEGRAM_IDS` in backend `.env` → `pm2 restart <backend-process-name>` |
| Turn bot notifications off (e.g. on a test server) | `TELEGRAM_NOTIFICATIONS=off` in backend `.env` → restart |
| D&D games (title, date, places, picture, status) | Admin → D&D |
| Experience levels, factions, paint and time options, max D&D players | `src/config/booking.ts` (one file) → restart |
| Players per table, painting capacity | `services` table: `seats_per_table`, `pool_capacity` |

**Admins:** open the admin panel from **Профиль → Админ-панель** (or the
`/admin` address — it now waits for the Telegram login instead of sending
you to the home page).

---

## 9. Rolling back

```bash
pm2 stop <backend-process-name>
# code
rm -rf <BACKEND_DIR> && cp -a ~/warphub-backup/backend <BACKEND_DIR>
rm -rf <CLIENT_WEB_DIR>/* && cp -a ~/warphub-backup/client-web/. <CLIENT_WEB_DIR>/
# database (replaces it with the backup copy!)
docker exec -i <PG_CONTAINER> psql -U <db-user> -d postgres -c "DROP DATABASE <db-name> WITH (FORCE);" -c "CREATE DATABASE <db-name>;"
docker exec -i <PG_CONTAINER> psql -U <db-user> <db-name> < ~/warphub-backup/db-<date>.sql
pm2 start <backend-process-name>
```

Restoring the database removes any bookings made after the backup, so only
do it if the new version really doesn't work.
