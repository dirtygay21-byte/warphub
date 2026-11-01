# WarpHub — инструкции для работы с репозиторием

Mini App WarpHub (Telegram) и скрытый раздел Roster Builder (Warhammer 40,000 и Age of Sigmar).
Подробности по данным ростера: `tools/roster-data/README.md`.

## Branches and deployment

- `main` is the stable branch: it matches production (or the next approved release). It is the GitHub default branch.
- `roster-builder` is the long-lived Roster Builder development branch. Data and migration work goes in short-lived
  branches from it (`data/<topic>`, e.g. `data/aos-stage-b`); after review it is merged into `roster-builder`, then into `main`.
- Other work (bookings, mini-games, etc.) goes in short-lived branches from `main`.
- `release/all-in-one` is the former production branch, frozen until the first deployment from `main`. Do not delete old branches.
- Merging into `main`, pushing and deleting branches only with the owner's explicit permission.
- Never deploy to or restart production without the owner's explicit permission.

## Данные ростера: порядок поиска источника (обязательно для любой работы с данными ростера)

> **Решение владельца от 23.10.2026: выгрузка Wahapedia приостановлена** — её данные устарели (40K от 28.09.2026, до MFM 1.5).
> Пока решение не отменено, шаг 2 ниже для 40K пропускается: основной датированный источник обновлений 40K — wh-rules.ru
> (снимки `tools/roster-data/40k/whrules-<версия>*.json` с fingerprint, применение через `40k/curated.json → updates`,
> сверка — `scripts/whrules-compare.mjs`, отчёт `40k/freshness-report.{json,md}`). Остальные правила раздела действуют:
> ничего не придумывать, источник и версию записывать, конфликты фиксировать.
>
> **Решение владельца от 30.10.2026: источники AoS** — выгрузка Wahapedia (основной, как раньше) и sigdex.io / BSData
> `age-of-sigmar-4th` (второй: сверка очков и юнитов `scripts/bsdata-aos-compare.py` → `aos/bsdata-compare.json`,
> карты батлпланов `aos/sigdex-battleplans-2026-27.json`). Официальные документы GW важнее обоих (`curated.json → officialUpdates`).
>
> **Kill Team (2024), решение владельца 30.10.2026:** источник — ktdash-v4-public (`prisma/seed-data.json`, лицензии нет),
> импорт `scripts/import-ktdash.mjs` → `backend/roster-data/kt/`. Подробности — `tools/roster-data/README.md`.
>
> **Dominatus (40K, нарративная кампания), решение владельца 31.10.2026:** источник — Wahapedia «Dominatus»
> (https://wahapedia.ru/wh40k11ed/the-rules/dominatus/), сверка — каталог сайта Dominatus владельца (`dirtygay21-byte/dominatus`).
> Данные — `backend/roster-data/dominatus.json` (кураторский файл, тесты `tests/dominatus.test.ts`); карты с полем `review` сверить с колодой.
>
> **Подсказки правил 40K, решение владельца 01.11.2026:** глоссарий (раздел 24 основных правил, термины, способности оружия
> фракций) — с wh-rules.ru: снимок `tools/roster-data/40k/whrules-<версия>-glossary.json` → `backend/roster-data/glossary.json`
> (`scripts/whrules-glossary.mjs`). Карточки юнитов дорабатываются по образцу wh-rules.ru, без переписывания.
>
> **Warcry, решение владельца 30.10.2026:** источник — krisling049/warcry_data (`data/`, лицензии нет),
> импорт `scripts/import-warcry.mjs` → `backend/roster-data/warcry/`; правила построения варбанды — warcrier.net.

1. **Приложение.** Сначала смотреть, что уже есть в данных и коде:
   `backend/roster-data/` (40K) и `backend/roster-data/aos/` (AoS), импортёры `tools/roster-data/scripts/`,
   кураторские правки `tools/roster-data/aos/curated.json`, движки `client/src/features/roster/{engine,aos}/`.
2. **Выгрузка Wahapedia (CSV) и её описание (Excel).** Если в приложении нет нужного, оно неполное или неясное —
   проверить CSV и спецификацию полей. Excel объясняет поля и связи, CSV — фактические записи и значения.
3. **Интернет** — только если информации нет ни в приложении, ни в выгрузке. Предпочитать официальные правила
   (Core Rules, General’s Handbook, Battle Profiles); в коде и интерфейсе указывать источник и редакцию.

Правила:

- Ничего не придумывать: правила, очки, ограничения, расстояния, связи. Нет данных — показать «нет данных» и записать пробел.
- Конфликт источников не решать молча: зафиксировать (комментарий, `import-report.json`, README) и выбрать с объяснением
  (пример: очки «Great Mawpot» — 0 в CSV и 20 в Battle Profiles, берётся Battle Profiles).
- Сохранять идентификаторы и связи выгрузки (id фракций, подтипов, варскроллов); не сливать разные игровые понятия.
- 40K и AoS — разные схемы и правила; общий код не должен смешивать их данные.

### Где лежит выгрузка

| Что | Файлы | Где ожидается в репозитории |
|---|---|---|
| AoS 4, CSV (13 таблиц, разделитель `|`, UTF-8 с BOM) | архив `AOS.rar` → `Factions.csv`, `Faction_abilities.csv`, `Faction_ability_types.csv`, `Faction_ability_subtypes.csv`, `Warscrolls*.csv` (7), `Source.csv`, `Last_update.csv` | `tools/roster-data/wahapedia-aos-csv/` |
| AoS 4, описание полей | `Export_Data_Specs_AOS.xlsx` | рядом с CSV (не в git) |
| 40K 11-я ред., CSV (21 таблица) | архив `40K.rar` → `Factions.csv`, `Datasheets*.csv`, `Detachments*.csv`, `Stratagems.csv`, `Enhancements.csv`, `Abilities.csv`, `Source.csv`, `Last_update.csv`; в архиве есть копия `Datasheets_detachment_abilities (1).csv` — побайтно совпадает с основной | `tools/roster-data/wahapedia-csv/` |
| 40K, описание полей | `Export_Data_Specs_40K.xlsx` | рядом с CSV (не в git) |

Обе папки CSV в `.gitignore` — **в репозитории выгрузки нет**. Архивы передаются владельцем в сессию; между сессиями они
не сохраняются. Если папок нет — попросить архивы и распаковать их туда. Дата выгрузки — в `Last_update.csv`
(последняя проверенная: AoS 2026-10-22 18:12, 40K 2026-09-28 02:38). Большие данные в инструкции не копировать.

### Что важно знать о выгрузке (из спецификации и проверки CSV)

- AoS: поле `description` обрезано выгрузкой на **1024 символах** (длина 1023 — срезан хвостовой пробел).
  Импорт помечает такие правила `incomplete: "truncated"`, интерфейс показывает предупреждение и ссылку на полный текст.
- AoS: таблицы в правилах не выгружаются — вместо них `$000001417`; помечается `incomplete: "table"`.
- AoS: `Faction_ability_subtypes.description` — примечания подтипа (например, дата перехода построения в Warhammer Legends).
- 40K: лимита длины нет; ссылка-заглушка `$…` встречается единично.
- Очков сезонных таблиц, построений, лоров и террейна AoS в CSV нет — они в `curated.json` (Battle Profiles).
- 40K: у 9 инфолистов Space Marines несколько таблиц цен без подписи ордена — привязка в `tools/roster-data/40k/curated.json`.
  Отчёты импорта: `tools/roster-data/aos/import-report.json`, `tools/roster-data/40k/import-report.json`.

## Проверки

```bash
cd tools/roster-data && bun test tests/          # движки, данные, сверка с CSV (если папка CSV есть)
cd client && npx tsc -p tsconfig.app.json --noEmit && npx eslint src/features/roster
```
