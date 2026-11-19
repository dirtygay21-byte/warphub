# WarpHub

Telegram Mini App клуба Warp Hub (@WarpHubBot).

- `backend/` — API (Bun + Elysia + Drizzle, PostgreSQL, MinIO). Запуск и деплой — `backend/DEPLOY.md` (GitHub Actions: CI, Server check, Deploy — `ops/README.md`).
- `client/` — Mini App (Vite + React + Tailwind).
- `tools/roster-data/` — Roster Builder (скрытый раздел по коду доступа): импорт данных Wahapedia и тесты правил. Деплой — `backend/DEPLOY.md` (через GitHub Actions, см. также `ops/README.md`).

Секреты (`.env`) в репозиторий не попадают — образцы: `backend/.env.example`, `client/example.env`.

## Права и источники данных

Репозиторий открыт для просмотра, но **не является open source**: лицензии на код нет — все права на код WarpHub
принадлежат его владельцу; копирование и использование без разрешения не допускаются.

Игровые данные WarpBuilder взяты из сторонних источников и принадлежат их правообладателям; они хранятся здесь
только для работы приложения клуба (некоммерческое использование):

- Warhammer 40,000, Age of Sigmar, Kill Team, Warcry — товарные знаки Games Workshop Ltd. Проект не связан с
  Games Workshop и не одобрен ею.
- Тексты и данные правил: wh-rules.ru, Wahapedia, BSData / sigdex.io, warmind.online, ktdash (ktdash-v4-public),
  krisling049/warcry_data, warcrier.net; данные 40kdc — по лицензии CC BY 4.0 (`tools/roster-data/vendor/`).
- Карты Kill Team и Warcry (`client/public/roster-maps/`) — материалы Games Workshop.

Правообладатель, который хочет удалить свои материалы, может написать владельцу репозитория — материалы будут удалены.
