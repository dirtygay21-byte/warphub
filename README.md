# WarpHub

Telegram Mini App клуба Warp Hub (@WarpHubBot).

- `backend/` — API (Bun + Elysia + Drizzle, PostgreSQL, MinIO). Запуск и деплой — `backend/DEPLOY.md`.
- `client/` — Mini App (Vite + React + Tailwind).
- `tools/roster-data/` — Roster Builder (скрытый раздел по коду доступа): импорт данных Wahapedia и тесты правил. Деплой — `backend/DEPLOY.md`, раздел 10.

Секреты (`.env`) в репозиторий не попадают — образцы: `backend/.env.example`, `client/example.env`.
