# WarpHub · Roster Builder — данные и тесты

Roster Builder — скрытый раздел Mini App WarpHub: конструктор ростеров **Warhammer 40,000 (11-я редакция)** и **Age of Sigmar (4-я редакция)**.
Открывается по одноразовому коду из 4 цифр (Профиль → «Есть код доступа?»).

Эта папка — не приложение, а инструменты вокруг него:
импорт выгрузки Wahapedia в JSON для бэкенда и тесты движка правил.

Данные: **powered by Wahapedia** (Export Data, `wh40k11ed`). Только для личного некоммерческого использования.

## Где что лежит

```
client/src/features/roster/engine/   правила и расчёты без React (rules.ts — числа правил, compute.ts — проверка)
client/src/features/roster/ui/       экраны: список, редактор, выбор юнита, экспорт
client/src/components/pages/Roster/  страница /roster (проверка доступа)
client/src/components/pages/Profile/AccessCodeDialog.tsx   ввод кода
client/src/components/pages/Admin/Roster/                  админка: коды и доступы
backend/src/modules/roster/          API: /roster/access, /roster/redeem, /roster/data/:name, /admin/roster/*
backend/roster-data/                 index.json + f/<фракция>.json (результат импорта, отдаётся только с доступом)
tools/roster-data/scripts/import-wahapedia.mjs   CSV → backend/roster-data
tools/roster-data/tests/             сценарии правил (29 тестов)
```

## Что умеет

- Все фракции из выгрузки (24), детачменты, улучшения, союзники (Assigned Agents, Freeblades, Dreadblades),
  юниты, которые разрешают детачменты (Plague Legions, Brood Brothers, Harlequins и т.д.).
- Точная стоимость 11-й редакции: размеры отряда, **ступени цены за копии** («1-я–2-я копия / 3-я+»),
  платное снаряжение («per Thunder Hammer»), доп. модели («+ 1 Invader ATV»), отдельные цены Assigned Agent.
- Проверка правил на лету (ошибки и предупреждения, тап → переход к юниту):
  - лимит очков; бюджет **Detachment Points** (в Incursion можно один детачмент за 3 DP); уникальные **теги** детачментов;
    **Force Disposition** из выбранных детачментов; переопределение DP для орденов (`Detachments_chapter_dp`);
  - лимит копий (2/3, Battleline ×2 — в т.ч. Battleline от детачмента, Dedicated Transport ×2, Epic Hero — 1);
  - улучшения: лимит 2/4, только из выбранных детачментов, только допустимым инфолистам, не Epic Hero и не союзникам,
    без повторов; **Upgrade** — до 3 не-персонажей, считается за одно улучшение, оплачивается за каждый юнит;
  - Warlord (персонаж, не союзник); **Leader/Support**: допустимые пары, ≤1 Leader и ≤1 Support на отряд
    (исключения «even if…» из инфолиста), Support обязан быть присоединён;
  - один орден Space Marines, ограничения орденских детачментов; Legends — предупреждение.
- Экспорт: **формат приложения GW** (ATTACHED UNITS / CHARACTERS / BATTLELINE …), короткий формат для чата,
  **код ростера** (`WH1.…`) для переноса на другое устройство; кнопка «Поделиться в Telegram».
- Хранение: Telegram **CloudStorage** (синхронизация между устройствами, длинные ростеры режутся на куски) + localStorage.
- Профиль юнита: характеристики, **оружие дальнего и ближнего боя** (все профили), **способности** (Core/Faction с текстом,
  способности инфолиста и снаряжения), повреждённый профиль, состав, ключевые слова, ссылка на Wahapedia.
- **Снаряжение отряда**: по умолчанию считается из текста инфолиста (все модели / сержант / остальные / доп. модели),
  можно поменять число каждого оружия; рядом — варианты замены из инфолиста; попадает в экспорт.
- Правила армии (Oath of Moment и т.п.), правила и стратагемы детачментов; в карточке юнита — **стратагемы, доступные
  именно ему** (основные + выбранных детачментов), и правила выбранных детачментов, которые на него действуют.
- Союзники по официальному тексту правил: Assigned Agents (Retinue/Character/Requisitioned), Freeblades, Dreadblades,
  Titanic Support, Daemonic Pact (лимит очков и правило BATTLELINE по богам), Corsairs and Travelling Players (Drukhari).
- **Правила детачментов, извлечённые из их текста** (данные, а не код): какие чужие юниты разрешены
  (Brood Brother Auxilia, Final Day, Shadow Legion, Questor Forgepact, Iconoclast Fiefdom, Tallyband Summoners,
  Khorne Daemonkin, Changehost of Deceit, Carnival of Excess, Reaper’s Wager, Devoted of Ynnead), их **лимит очков**,
  запрет на Warlord («No X model can be your WARLORD»), обязательный Warlord («A GENESTEALER CULTS model must be…»),
  исключённые ключевые слова, запрещённые юниты (Shadow Legion), обязательные юниты (Devoted of Ynnead, Houndpack Lance),
  повышенный лимит копий (Ghosts of the Webway) и отключение правила армии (Reaper’s Wager → Corsairs).

## Тесты

```bash
cd tools/roster-data
npm install
npm test             # движок и правила формирования армии, 29 сценариев
```

## Обновление данных

### Чеклист обновления данных 40K (P1-T7, 30.10.2026)

С 23.10.2026 выгрузка Wahapedia для 40K приостановлена (`CLAUDE.md`): основной датированный источник — wh-rules.ru.
Подробности по каждому шагу — в разделах ниже.

1. **Снимки** в браузере на wh-rules.ru: очки — `scripts/whrules-extract.js`, конструктор ростеров —
   `scripts/whrules-extract-roster.js`; полный снимок (`scripts/whrules-extract-full.js`) — только для армий, у которых
   меняются инфолисты. Сохранить с проверкой схемы и fingerprint: `node scripts/whrules-save.mjs <файл>`,
   `node scripts/whrules-map.mjs --save-full <файл>`.
2. **Измерить**: `bun scripts/whrules-compare.mjs --snapshot whrules-<версия>.json` → `40k/freshness-report.md` — что
   отличается, по армиям. Данные приложения не меняются.
3. **Применить** через `40k/curated.json → updates`: очки (`whrules-points`), платное снаряжение (`whrules-wargear`),
   полные конвертации (`whrules-faction-convert`). Конвертации — сначала сухой прогон
   (`bun scripts/whrules-convert.mjs … --out <файл>`).
4. **Пересобрать и проверить**: `bun scripts/repair-40k-data.mjs`, затем `bun test tests/` — все тесты, сверка с
   конструктором ростеров сайта должна показать 0 отличий.
5. **Просмотреть**: конфликты источников (`import-report.json`, отчёт свежести), переводы сохранённых ростеров
   (`migrations`), подписи версии данных в приложении. Конфликты не решать молча — записать и выбрать с объяснением.
6. **Выпуск**: ветка `data/<тема>` → PR в `roster-builder` → PR в `main` → deploy `data` (dry-run, затем apply) →
   проверка в Telegram. Бэкенд перезапускать не нужно: данные читаются с проверкой даты изменения файла.

Age of Sigmar (решение владельца 30.10.2026): основной источник — выгрузка Wahapedia (импорт ниже), второй — sigdex.io,
который показывает данные BSData `age-of-sigmar-4th`. Отчёт свежести — `aos/freshness-report.md`.

1. Скачать CSV Wahapedia (`https://wahapedia.ru/aos4/<таблица>.csv`, 13 таблиц) в `tools/roster-data/wahapedia-aos-csv/`.
2. `node scripts/import-wahapedia-aos.mjs`, затем `node scripts/repair-aos-data.mjs`; разобрать `aos/import-report.json`
   (новые таблицы правил — `curated.json → seasons`; официальные правки, не применённые к новой выгрузке, — пересмотреть).
3. Сверка с BSData: `git clone --depth 1 https://github.com/BSData/age-of-sigmar-4th` и
   `python3 scripts/bsdata-aos-compare.py <путь>` → `aos/bsdata-compare.json`; расхождения — в отчёт свежести.
   Подсказки AoS (07.11.2026): способности оружия (Crit, Anti-X, Companion…) и основные ключевые слова (FLY, WARD, CHAMPION…) —
   `python3 scripts/bsdata-aos-core.py --repo <путь>` → `client/src/features/roster/aos/core-rules.json` (тексты BSData, источник и коммит в файле;
   тест `tests/aos-core-rules.test.ts`). «Blood-hungry», «Wyrdflame» — без текста в источниках, показываются без подсказки.
4. Карты батлпланов (S3): снимок Sigdex `aos/sigdex-battleplans-2026-27.json` → `node scripts/aos-battleplan-maps.mjs`
   (`battlepack.json → battleplans[].map`; `--check` — проверка, её же делает тест). Зеркала раскрываются как в Sigdex,
   точки на оси симметрии не дублируются; «sigmarite» = Scions of the Comet; территории A и B — атакующий выбирает свою
   (GH 2026-27), размер террейна на карте условный.

```bash
# из скачанных CSV (положить в tools/roster-data/wahapedia-csv/)
npm run data

# или скачать свежие с Wahapedia (только если изменился Last_update.csv)
npm run data:fetch
```

Результат пишется в `backend/roster-data/`. Бэкенд подхватывает новые файлы сам (кеш сверяет дату изменения),
перезапуск не нужен. Если папка данных на сервере лежит в другом месте — `ROSTER_DATA_DIR` в `.env` бэкенда.

Нужные файлы: `Factions, Source, Datasheets, Datasheets_keywords, Datasheets_models, Datasheets_unit_composition,
Datasheets_models_cost, Datasheets_enhancements, Datasheets_leader, Enhancements, Detachment_abilities, Detachments,
Detachments_chapter_dp, Last_update, Abilities, Datasheets_abilities, Datasheets_wargear, Datasheets_options, Stratagems,
Datasheets_stratagems, Datasheets_detachment_abilities` — то есть вся выгрузка Wahapedia. Можно повесить на cron:

```cron
30 4 * * * cd /srv/warphub/tools/roster-data && npm run data:fetch >> /var/log/roster-data.log 2>&1
```

Импортёр без зависимостей, колонки читаются по имени, а не по позиции.

**Отчёт импорта 40K** — `tools/roster-data/40k/import-report.json`: проблемы самой выгрузки (повторы id, ссылки на
несуществующие записи, инфолисты без цены или без источника, размеры из таблицы цен вне состава отряда, детачменты
без стратагем) и то, что импорт не смог разобрать. Тест `tests/audit40k.test.ts` проверяет исправления аудита данных
40K и что повторный импорт не меняет `backend/roster-data` (если CSV на месте).

**Цены орденов.** У части инфолистов Space Marines несколько таблиц цен (Blood Angels, Dark Angels, Deathwatch платят
иначе), но в выгрузке не подписано, какая чья. Импорт сохраняет их в `costVariants`; орден каждой таблицы задаётся в
`tools/roster-data/40k/curated.json → chapterCosts.map` (`"<id инфолиста>": ["Blood Angels"]`) по проверенному источнику.
Пока привязки нет, действует обычная цена, а отчёт импорта перечисляет такие инфолисты. Движок берёт цену по ордену
ростера (`costsFor` / `bandFor` в `engine/compute.ts`).

**Обновления поверх выгрузки 40K** (`40k/curated.json → updates`). Проверенные изменения данных, которых нет в выгрузке
Wahapedia (например, более новые очки), применяются функцией `repair40kData` (`scripts/updates-40k.mjs`): в конце
импорта и командой `node scripts/repair-40k-data.mjs [--check]` для готовых данных без CSV. Повторный запуск ничего не
меняет; переимпорт не стирает обновления. Элемент: `{ id, kind, snapshot, enabled, scope, note }` — `kind` выбирает
обработчик, `snapshot` — файл снимка источника в `40k/` (проверяется fingerprint), `scope`/`note` — что обновлено и что
осталось на версии выгрузки. Применённые обновления записываются в `index.json → updates` (источник, версия данных,
версия Munitorum Field Manual, дата). Включено одно обновление — `whrules-981-space-marines` (kind `whrules-faction`, `scripts/whrules-convert.mjs`): Space Marines с орденами и Imperial Agents из полного снимка wh-rules.ru 981, копии Imperial Agents в AC, AM, AS, AdM, GK, QI, TL. Обработчик использует движок клиента (TypeScript), поэтому импорт и repair запускаются через `bun` или `node --import tsx` (`npm run data` уже так). Сухой прогон: `bun scripts/whrules-convert.mjs --out <файл>` — считается от данных до обновления (`scripts/baseline-40k.mjs`: история git, коммит 4a91fa0); тесты — `tests/whrules-*.test.ts`, `tests/updates40k.test.ts`.

**Полная конвертация одной фракции** (`40k/curated.json → updates`, kind `whrules-faction-convert`,
`scripts/whrules-convert.mjs → applyWhrulesFactionConvert`; сейчас `whrules-995-custodes`, задача P1-T4). Полный снимок
фракции (`scripts/whrules-extract-full.js` с `window.__whrulesFactions`, `whrules-map.mjs --save-full` →
`40k/whrules-<версия>-full-<фракция>.json`), сопоставление `mapFaction` (`bun scripts/whrules-map.mjs --faction <slug>
--army <id>`), план `planFaction`, конвертация `convertFaction` (общая часть с Space Marines — `makeConverter`), сухой
прогон с проверками — `bun scripts/whrules-convert.mjs --faction <slug> --army <id> --full <снимок> --out <файл>`.
id сопоставленных и переименованных (по таблице сайта) инфолистов сохраняются, новые — `whr:<фракция>:<slug>`; прежние
детачменты, улучшения и стратагемы остаются устаревшими (старые ростеры открываются). Неразрывный дефис сайта (U+2011)
заменяется обычным. Применяется до `whrules-points` (значения затем совпадают с сайтом). `migrations` файла — список
обновлений по порядку (`client/src/features/roster/engine/migrate.ts → migrationsOf`): переводы вариантов снаряжения
каждого применяются к ростеру один раз по его `source`. Если сохранённого размера отряда у того же инфолиста больше нет
(новый кодекс), `migrateRoster` откладывает его (`unit.migration`, причина `size`) и показывает предупреждение.

**Полная конвертация остальных фракций (07.11.2026, Task C, партия 1):** AS, AdM, AE, QT, EC, GC, GK, LoV, TYR — из снимка
`40k/whrules-995-full-25-factions.json` (25 фракций сайта, кроме уже полных Custodes, CSM + IK, Orks). У элементов `updates`:
`keepOldLimits` — ограничения построения детачмента (Battleline, обязательные юниты, лимиты, тег) остаются прежними, если в тексте
сайта их нет (раздела «KEYWORDS» у сайта нет), запись в legacy; `syncCopies` — копии инфолистов армии у союзников в других файлах
(Chaos Knights — dreadblades, Aeldari — corsairs) обновляются вместе с армией. После обновления фракции — `node scripts/ru-warphub.mjs
--prune` (убрать переводы WarpHub, ставшие ненужными: текст есть на сайте или английский изменился), `--prefill`, `--check`.

**Обновление значений по wh-rules.ru** (`40k/curated.json → updates`, kind `whrules-points`, `scripts/whrules-points.mjs`;
сейчас `whrules-995-points`, задача P1-T3). У сопоставленных записей (та же функция сопоставления, что и отчёт свежести)
меняет цены отряда и ступени цены за копии, Legends, DP детачментов, очки улучшений и платное снаряжение; id, профили,
оружие и правила не трогает. Подписи размеров и названия снаряжения остаются нашими — сохранённые ростеры хранят по ним
выбор. Другой размер отряда — смена состава: не применяется (полная конвертация). Копии юнита в других файлах (союзники,
инфолисты детачментов с тем же названием и прежними ценами) получают те же значения; цены союзника Agents of the Imperium
(`ally:agents`) не трогаются. `only` в элементе curated ограничивает армию (Adeptus Custodes: только цены отряда — кодекс в
полной конвертации). **Платное снаряжение — во всех ступенях цены за копии**: конструктор ростеров сайта добавляет его к
каждой копии (решение владельца 2026-10-23, P1-T5; прежнее «только последняя ступень», как в выгрузке Wahapedia, отменено;
`40k/whrules-points-applied.json` — запись применения P1-T3, пересчитанная с размещением P1-T5:
`bun scripts/whrules-points.mjs --base f8387fa --only '{"AC":["points"]}'`). План/отчёт —
`bun scripts/whrules-points.mjs` → `40k/whrules-points-applied.json` (что изменится, копии, пропуски); применение —
`bun scripts/repair-40k-data.mjs` (и в конце импорта). Тесты — `tests/whrules-points.test.ts`.

**Платное стандартное снаряжение** (`40k/curated.json → updates`, kind `whrules-wargear`, `scripts/whrules-wargear.mjs`,
задача P1-T5). Источник — данные конструктора ростеров wh-rules.ru: снимок `40k/whrules-<версия>-roster.json` (схема
`whrules-roster/1`; `scripts/whrules-extract-roster.js` в консоли сайта → `node scripts/whrules-save.mjs <файл>`). Сайт
считает юнит так: база + ступень копии + очки платного стандартного снаряжения (`dw`, возврат `dr`, если вариант его снимает)
+ очки выбранных вариантов. У нас — по предметам: цена предмета из `costs[].wargear`, платится каждая штука итогового
снаряжения; стандартные штуки — только у инфолистов с `paidDefaults` (у сайта есть `dw`: лазпушка Leman Russ, missile pod
Crisis Fireknife; у Gladiator Valiant BT две стандартные multi-melta входят в базу). Обработчик ставит `paidDefaults` по
сопоставлению `compareArmy` (снимок очков в поле `points`) и копиям с тем же id; платный стандартный предмет, которого нет в
нашем стандартном снаряжении, — ошибка. План — `bun scripts/whrules-wargear.mjs`. Сверка — `tests/paid-wargear.test.ts`:
все варианты сайта с очками (390) дают ту же доплату, стандартное снаряжение 15 юнитов с `dw` — ту же сумму.

**Снимок wh-rules.ru** (`40k/whrules-<версия>.json`, сейчас `whrules-981.json`: данные приложения 981, MFM 1.6,
14.10.2026). Схема `whrules-points-snapshot/1`: `source` (сайт, версия данных, MFM, дата, время снятия), `assets`
(SHA-256 каждого прочитанного JS-модуля сайта), `factions` (Space Marines, 5 орденов, Imperial Agents: инфолисты
`{id, name, legends, points}`, у орденов `pointsOverrides` и `sharedUnitIds`), `patches` (история обновлений и изменения
очков этих фракций), `fingerprint` (SHA-256 от `JSON.stringify` снимка без него). Как снять заново: открыть
https://wh-rules.ru/ru/patches, выполнить `scripts/whrules-extract.js` в консоли браузера, сохранить строку
`window.__whrulesSnapshot` в файл и запустить `node scripts/whrules-save.mjs <файл>` — он проверит схему и fingerprint.
wh-rules.ru — вторичный источник (не GW): версии и даты сверены с Warhammer Community; стоимости снаряжения в снимке 981 нет (на сайте они появились позже — см. снимок /3 ниже).

**Снимок всех фракций и отчёт свежести** (с 23.10.2026 выгрузка Wahapedia приостановлена — см. `CLAUDE.md`).
`scripts/whrules-extract.js` снимает схему `whrules-points-snapshot/3`: все фракции сайта (или `window.__whrulesFactions`),
у каждой — инфолисты с очками и платным снаряжением (`wargearPoints`, на сайте появилось после версии 981), детачменты с DP и
улучшениями (очки), таблица переименований сайта; плюс история обновлений с числом изменений по фракциям. Запись очков без
числа моделей и без пометки — платная добавка (платформа Tidewall Shieldline). Перенос — `window.__whrulesSnapshotGz` (gzip+base64) или `window.__whrulesSnapshot`, затем
`node scripts/whrules-save.mjs <файл>` (проверка схемы и fingerprint) → `40k/whrules-<версия>.json` (сейчас `whrules-995.json`).
Сверка с данными приложения — `bun scripts/whrules-compare.mjs [--snapshot whrules-995.json]` → `40k/freshness-report.json`
(подробно) и `.md` (сводка по армиям). Только чтение: данные приложения не меняются. Инфолисты сопоставляются по slug названия и
таблице переименований сайта; без пары — в отдельные категории (другая фракция сайта, Legends/Forge World, которых на сайте нет,
уже помеченные устаревшими), догадок нет; версии орденов (источник «Black Templars» и т.п.) сравниваются с инфолистом своей
фракции сайта. Цены сравниваются по размерам отряда (число моделей или подпись состава) и ступеням за копии; отдельно —
платные добавки и платное снаряжение (та же цена / другая / только у нас / только на сайте и считает ли движок предмет сам —
`paidIsAuto`). Тесты — `tests/whrules-compare.test.ts`.

**Полный снимок wh-rules.ru** (`40k/whrules-981-full.json`, схема `whrules-full/1`): инфолисты целиком (профили, оружие,
способности, состав, снаряжение, варианты, ключевые слова, лидер, транспорт, очки, Legends, источник), построения
(правило, улучшения с очками, стратагемы), правило армии и ордена — для тех же 7 фракций; художественный текст и русские
переводы не снимаются. Снять: `scripts/whrules-extract-full.js` в консоли браузера на wh-rules.ru, сохранить
`window.__whrulesFullGz` (gzip+base64) или `window.__whrulesFull` в файл, затем `node scripts/whrules-map.mjs --save-full <файл>`
(проверка схемы, SHA-256 модулей и fingerprint). Только источник: данные приложения он не меняет.

**Id и сохранённые ростеры при обновлении** (`planSpaceMarines` в `scripts/whrules-map.mjs`, клиент — `engine/migrate.ts`).
Сопоставленные инфолисты сохраняют id; новые получают `whr:<фракция>:<slug>`; объединённые и заменённые общими
инфолистами записываются в `FactionData.migrations` (`datasheets`/`detachments`/`enhancements`: прежний id → `{to, reason, note,
keepPicks}`). Редактор при открытии ростера переводит его на новые id: совместимые выборы переносятся, несовместимые
откладываются в `unit.migration.dropped` с предупреждением (не удаляются). Инфолисты, которых нет в собранном снимке,
остаются доступными и получают `outdated` (пояснение) — в списках к названию добавляется «*».

**Лимит копий** считается по названию инфолиста: одноимённые версии (Space Marines и Black Templars) делят лимит и
ступени цены. Фракция без детачментов (Adeptus Titanicus) не показывается как армия — её юниты остаются союзниками.

## «Поле боя»: раскладки и деплой

Карты в разделе «Поле боя» — 45 раскладок террейна Chapter Approved 2026–27 (по 3 на каждую из 15 пар типов армий)
и 6 карт деплоя. Источник — [40kdc-data](https://github.com/wn-mitch/40kdc-data) (Alpaca Software и участники 40kdc,
данные CC BY 4.0, геометрия раскладок — Battlemaster). Картинки GW не копируются: приложение рисует карты само по координатам.

Обновить, когда в 40kdc-data выйдут новые раскладки:

```bash
cd tools/roster-data
# положить репозиторий 40kdc-data в tools/roster-data/40kdc-data (git clone или распакованный ZIP)
npm run battlefield      # → backend/roster-data/battlefield.json
```

Сверка с game-datamissions.com и официальными картами деплоя (Mission Deck 2026-27) — `battlefield-review.json`.
Конфликт источников: в 40kdc-data 1.4.5 у Dawn of War и Sweeping Engagement перепутаны атакующий и защитник
(форма зон та же). Берутся официальные карты: импорт меняет подписи сторон (`SWAP_SIDES` в `import-battlefield.ts`),
проверка — `tests/battlefield.test.ts`. У 7 раскладок пара размеров до центральных руин на 1,7–2″ больше, чем на GDM
(другая точка отсчёта) — оставлено как есть, записано в отчёте.

Резолвер геометрии взят из 40kdc-data (`vendor/40kdc-resolve.ts`, MIT). В приложении обязательна подпись
«Powered by 40kdc-data» со ссылкой на https://40kdc.alpacasoft.dev — она стоит внизу экрана «Поле боя».

## Карты миссий (Chapter Approved 2026-27)

`backend/roster-data/missions.json` — 25 основных и 18 вторичных карт для экрана «Поле боя». Состав, id, пары типов армий
и лимиты ПО — из 40kdc-data; тексты — свои, на русском (`40k/missions-ru.json`: смысл и числа как на карте, без
художественного текста). Сверка — `40k/missions-review.json`: изображения карт game-datamissions.com, правила колоды
миссий, данные wh-rules.ru. Конфликты (Assassination, Forward Position у 40kdc) решены по карте и записаны в отчёте.

```bash
npm run missions     # 40kdc-data в tools/roster-data/40kdc-data → backend/roster-data/missions.json
```

Сборка падает, если карта, пара или очки расходятся с 40kdc и это не записано в отчёте.

## «Начать игру»: движок партии (40K)

Код — `client/src/features/roster/game/` (без React и без загрузки данных), тесты — `tests/game-*.test.ts`.
Движок получает каталог (`GameCatalog`: карты и лимиты из `missions.json`, пары и раскладки из `battlefield.json`).

- **Журнал событий.** Партия — список событий (`GameEvent`: `id`, `seq`, `seat`, `at`, `type`), он только дописывается.
  Состояние не хранится и не правится: его получает `replay(events, catalog)`, применяя `applyEvent` по порядку.
  Ошибки возвращаются (`ApplyResult`, текст по-русски), исходное состояние не меняется.
- **Места, а не телефоны.** Игроки — `p1`/`p2`. Событие с `seat = null` — общее (один телефон, подготовка);
  с `seat` — меняет только данные своего места; ходовые события — только активного игрока.
- **Случайность** — из `seed` игры (`rng.ts`): колода = seed + место + номер перемешивания, броски — seed + ключ.
  Вытянутые карты пишутся в событие явно; случайная выдача обязана совпадать с верхом колоды. `Math.random` в
  модуле запрещён тестом.
- **Отмена** — событие `event-reverted`, как стек: снимает последнее действующее событие (своё или общее);
  журнал остаётся целым, состояние возвращается к снимку до события.
- **Очки** считает движок по отмеченным строкам карты (`cardVp`), итоги с лимитами — `totals()`:
  основная 15 за раунд / 45 за битву (ПО «в конце битвы» вне лимита раунда), вторичные 15 / 45 и не больше 20
  с фиксированной карты, Battle Ready 10. Базовые CP — по 1 обоим игрокам в каждой фазе командования (Core Rules 08.02).
- **Подготовка** (`setup.ts`) — шаги в порядке правил: типы армий (тайно → раскрытие) → раскладка → атакующий и
  защитник (бросок, победитель выбирает) → вторичные (тайно → раскрытие) → первый ход (бросок, победитель ходит
  первым). Броски пишутся с номером (`roll.attempt`), кубики движок считает по seed; отмена возвращает счётчик.
- **Сохранение** (`serialize.ts`): журнал + версия схемы (`GAME_SCHEMA`) + отпечаток данных миссий. Новая схема —
  функция в `MIGRATIONS` и `GAME_SCHEMA + 1`; более новое сохранение не открывается («обновите приложение»).
- **Автосохранение** (`autosave.ts`, G4b): после каждого действия и отмены журнал пишется в localStorage телефона
  под ключом аккаунта Telegram (`warphub.game.40k.v1.<id>`); «Начать игру» предлагает продолжить. Только на этом
  устройстве — журнал больше лимита CloudStorage (4096 символов); нечитаемое сохранение не удаляется, а откладывается
  под `.broken` перед новой игрой.

**Путь к двум телефонам** (не сделано, движок к нему готов): сервер хранит журнал партии и назначает `seq`;
телефон отправляет события своего места с ожидаемым `seq` — устаревшие отклоняются, телефон берёт свежий журнал
и проигрывает его; сервер запускает тот же `applyEvent` для проверки и может хранить `seed` у себя (перемешивание
и броски проверяются по нему). Тайный выбор сервер не отдаёт второму игроку до раскрытия: тип армии — до
`dispositions-revealed`, режим вторичных — до `secondaries-revealed`; на одном телефоне игроки выбирают по очереди.

- **Ростеры** (G2.12): без ростера у обоих игроков игра не начинается (свой из Roster Builder или код `WH1.…`).
  Снимок ростера в игре (`RosterRef`): детачменты, типы армий, которые они дают (`dispositions`, id из battlefield.json),
  выбранный в ростере тип и код ростера. Тип армии игрок тайно выбирает только из `dispositions` (правила колоды
  миссий: доступные карты Force Disposition определяются при сборе армий — детачментами ростера); основная миссия —
  из пары. В режиме мастера (переключатель «Мастер», хранится на телефоне) ростеры открываются только для просмотра.
- **Момент подсчёта** — из данных карты: у блока вторичной `turn` (ваш ход / ход противника / любой / ход противника
  или конец 5-го раунда — G2.11a), у блока основной `at` (конец вашего хода / вашей фазы командования, в 5-м раунде —
  конец хода / любого хода / конец битвы — G3.1). Оба поля сверяются с текстом «Когда» при сборке `missions.json`.
- **Фаза командования** (G3.3): тактический игрок обязан взять 2 карты (меньше, если колода кончается); «при взятии» —
  `onDraw` карты (вернуть в колоду и перемешать / сбросить и взять новую / записать выбор), Defend Stronghold
  в 1-м раунде — обязательно; пока это не сделано, фаза не заканчивается. Номер выхода из колоды `n`, журнал сброса.
- **Конец битвы** (G3.6): после 5-го раунда — сам; досрочно — `battle-ended` по договорённости (итог по ПО) или
  сдачей (`by`): **сдавшийся проигрывает независимо от ПО** — решение владельца от 23.10.2026 (правила о сдаче
  в наших источниках нет, принято турнирное соглашение). Итог — `battleResult()`.

**Ограничения движка:** условия правил «при взятии» про обстановку на столе (нет отрядов с численностью 13+,
нет моделей с W 10+) и сами условия строк карт проверяет игрок; движок проверяет раунд, момент, порядок и лимиты.

## Dominatus (40K, нарративная кампания) — DM0, 31.10.2026

- Файл: `backend/roster-data/dominatus.json` (схема `warphub-dominatus/1`), отдаётся как `GET /roster/data/dominatus`;
  клиент — `loadDominatus()` и типы `client/src/features/roster/dominatus/types.ts`.
- Источник: Wahapedia «Dominatus» (https://wahapedia.ru/wh40k11ed/the-rules/dominatus/, проверено 31.10.2026);
  названия и локации сверены с каталогом сайта Dominatus владельца. Кураторский файл (генератора нет), правки — вручную с тестами.
- Состав: альянсы, фазы (2/2/1 битвы), лимиты (3 улучшения, 4 в Titangrave, до 3 Agenda Achieved, 35+ ПО), 9 локаций
  (D6, бонус, названия правил зоны боевых действий), карты улучшений, 27 Agenda как основные миссии в формате карт колоды
  (блоки/строки/«+»/«или», `at`), условия Agenda Achieved и действия миссий — пересказ на русском.
- `at: 'round-end'` (конец раунда: A Proper Challenge, Capture Trophies) движок «Начать игру» поддержит в DM1.
- Поле `review` — где Wahapedia в разных выборках читалась по-разному: сверить с физической колодой.
  Таблица Briefing (две Force Disposition → Agenda) из Wahapedia не читается — нужна фотография карт.
- Тесты: `tests/dominatus.test.ts`.

### Режим Dominatus в «Начать игру» — DM1, 31.10.2026

- «Начать подготовку» (и игра на двух телефонах) открывает выбор режима: «Warhammer 40,000 · 11-я редакция» или «Dominatus».
  Режим пишется в `game-created.mode` (у обычной игры поля нет — старые журналы читаются как раньше).
- Шаги подготовки Dominatus: «Кампания» (фаза, локация броском D6 по seed или выбором, альянсы — разные) после игроков;
  «Agenda и улучшения» после раскрытия типов армий (Agenda — только если играют оба; выбор из трёх Agenda альянса в фазе,
  пока нет таблицы Briefing; улучшения до 3, в Titangrave до 4, без повторов карт и отрядов).
- События: `dom-location-set`, `dom-player-set`, `dom-achieved`; `primaryFor` даёт Agenda вместо основной миссии колоды.
- Момент `round-end` (конец раунда) — после фаз хода игрока, ходящего вторым; контекст подсчёта один для движка и экранов
  (`primaryContext`).
- Итог: `dominatus/rewards.ts` — Battle Honour / Battle Skill / Path to Conquest, +1 карта на выбор при Agenda Achieved,
  подсказка 35+ ПО. Тесты: `tests/game-dominatus.test.ts`.

## Глоссарий правил 40K: подсказки в карточках юнитов — 01.11.2026

Решение владельца 01.11.2026: карточки юнитов и подсказки правил — по образцу wh-rules.ru, тексты подсказок — с wh-rules.ru (на русском).

- Снимок: `scripts/whrules-extract-glossary.js` (выполнить в консоли браузера на https://wh-rules.ru/ru/patches) →
  `node scripts/whrules-glossary.mjs --save <файл>` (проверка fingerprint) → `40k/whrules-<версия>-glossary.json`
  (раздел 24 основных правил — способности оружия и юнитов с номерами, термины правил, особые способности оружия фракций; EN и RU).
- Файл приложения: `node scripts/whrules-glossary.mjs --build` → `backend/roster-data/glossary.json` (только RU; без ручных правок).
- Приложение: `client/src/features/roster/glossary.ts` (поиск: «Anti-Infantry 4+» → [ANTI], разметка `**…**`, `[gloss:id:текст]`),
  подсказка `ui/common/RulePopover.tsx`. Тест `tests/glossary.test.ts`: каждая способность оружия и основная способность из инфолистов
  есть в глоссарии.
- Пробелы источника (версия данных 995): у «C'tan Power» (3 оружия Necrons) и терминов Other / You нет текста — подсказка «нет данных».

## Русские тексты 40K с wh-rules.ru — 01.11.2026

Решение владельца 01.11.2026: всё, что есть на wh-rules.ru по-русски, показывать по-русски. Тексты берутся с сайта как есть,
ничего не переводится вручную; чего на сайте нет — остаётся по-английски (данные `f/<фракция>.json` не меняются).

- Снимок: `scripts/whrules-extract-ru.js` (консоль браузера на https://wh-rules.ru/ru/patches) → `node scripts/whrules-ru.mjs --save <файл>`
  → `40k/whrules-<версия>-ru.json`: по каждой фракции сайта армейское правило, детачменты (правило, стратагемы, улучшения),
  русские названия, инфолисты (способности, снаряжение, ауры, варианты, лидер, транспорт) и английские названия в том же порядке.
- Покрытие: `node scripts/whrules-ru.mjs --report` → `40k/ru-coverage.{md,json}` (что есть по-русски и полный список того, чего нет).
- Приложение: `node scripts/whrules-ru.mjs --apply` → `backend/roster-data/ru/<фракция>.json` (оверлей по id приложения; сервер:
  `/roster/data/ru-<фракция>`). **После любого обновления данных 40K — снова `--apply`** (тест `tests/ru.test.ts` это проверит).
- Сопоставление только по названиям, как на сайте: инфолист — slug названия (своя фракция, орден, затем любая фракция сайта);
  способность — английское название (без пометок в скобках); детачмент, стратагема, улучшение — по названию в том же порядке, что на сайте;
  армейские правила — основной текст и разделы «### English | Русское» внутри армейского правила сайта.
- Разметка текстов сайта: `**жирный**`, `[gloss:id:текст]` (термин глоссария), `[core:Deep Strike]` (основная способность), `__выделение__`, `### заголовок`, `◈`.
- Версия данных 995 (MFM 1.6, 16.10.2026): инфолисты 95 %, способности 93 %, ссылки на армейское правило 94 %, армейские правила 88 %,
  детачменты 86 %, правила детачментов 79 %, стратагемы 82 %, улучшения 77 %. Пробелы: Legends (131 инфолист), детачменты и стратагемы,
  которых на сайте уже нет или которые переименованы (наши данные старше сайта — отдельная задача обновления).

## Доступ по коду

- Код создаёт владелец в админке (вкладка «Ростеры» → «Создать код доступа»). Бот присылает его в Telegram.
  Если бот не смог написать (не нажат «Старт» в @WarpHubBot) — код показывается прямо в админке.
- Код одноразовый, действует 24 часа (`ROSTER_CODE_TTL_HOURS`). В базе хранится только его HMAC.
- Перебор ограничен: 5 неверных попыток в час на человека и 30 в час на всех.
- Доступ бессрочный, закрывается в админке кнопкой «Закрыть». Администраторы имеют доступ всегда.
- Кто может создавать коды: `ROSTER_ADMIN_TELEGRAM_IDS` (через запятую), иначе — все администраторы.

## Известные ограничения

- Значения, помеченные «≈» в `client/src/features/roster/engine/rules.ts`, взяты из вторичных источников: бюджет DP для Onslaught
  и лимит Dedicated Transport.
- Варианты замены оружия разбираются из текста Wahapedia в правила (`client/src/features/roster/engine/wargear.ts`):
  кто может (лимиты «1 на каждые 10 моделей», «только Nob», «если в отряде 10+»), что заменяется и на что.
  Собрать незаконное снаряжение нельзя. Разобрано 99,2% инфолистов с вариантами; у остальных (~13, например
  «two different weapons from the following list») такие варианты показаны текстом и не выбираются.
  Платное снаряжение (Killsaw +5 и т.п.) считается автоматически, как в конструкторе ростеров wh-rules.ru
  (`compute.ts → paidFromLoadout`, задача P1-T5): на каждой копии юнита платится каждая штука итогового снаряжения
  (стандартное − снятое заменами + выбранное); стандартные штуки — только при `paidDefaults` (см. «Платное стандартное
  снаряжение»). Ручной счётчик — только Banner of Macragge у Victrix Honour Guard: предмет необязательной модели «0-1 Chapter
  Ancient», выбора состава у отряда нет (`compute.ts → optionalWargear`: счётчик не больше числа таких моделей, подсказка
  «если в отряде есть Chapter Ancient»; у сайта в составе по умолчанию Ancient нет — +0). Сохранённый ручной счётчик,
  расходящийся с автоматическим, даёт предупреждение `wargear-auto`. Конвертация wh-rules (`whrules-convert.mjs`) кладёт в
  стандартное снаряжение и предметы без профиля оружия (Banner of Macragge, Praesidium Shield, Jump Pack). Варианты
  «up to two of the following, but cannot take duplicates», «replaced with: X and Y» разбираются. Закрепление «X этой модели
  нельзя заменить» (`ParsedOption.locks`) — в скобках («(that model’s Storm Bolter cannot be replaced)»: у модели с Cyclone
  Missile Launcher Storm Bolter остаётся), отдельным предложением («… 1 power fist. That model’s boltgun cannot be replaced.»)
  и сноской «*» — проверяется: такой предмет не снимает другой вариант (сверено со всеми `keep` конструктора сайта).
  «You cannot select the same option more than once» — каждый вариант не больше раза (`oncePerUnit`; Raptors). Инфолистам,
  у которых в тексте вариантов нет, а у конструктора сайта они есть (Impulsor, Repulsor, Repulsor Executioner Space Marines,
  Venerable Dreadnought и Wulfen Space Wolves), обновление whrules-wargear добавляет формулировки конструктора
  (`options[].source = 'whrules-roster'`). Отдельные варианты конструктора — `curated.json → whrules-995-wargear →
  rosterOptions` (P1-T5c): `add` — недостающий вариант (Watcher in the Dark у Deathwing Terminator Squad: в тексте инфолиста
  сайта его нет, в конструкторе — есть), `replace` — наш вариант с опечаткой или чужим оружием (Kâhl, Ynnari Incubi, Kroot War
  Shaper, Secutarii Peltasts) заменяется формулировкой конструктора. Остальные расхождения формулировок с конструктором
  разобраны в `40k/whrules-995-roster-options-review.json` (wording — то же другими словами; конфликты содержания решены в
  P1-T5e — `resolved`: Chaos Acastus Knight Porphyrion — обе пушки вместе, Wolf Scouts — bolt pistol, Thunderclap и runic
  stave вместе по конструктору (решение владельца), Kill Tank и Gargantuan Squiggoth — `whrules-995-wargear → datasheets`:
  оружие, снаряжение и варианты из полного снимка `40k/whrules-995-full-orks.json`). Сохранённые выборы у инфолистов с
  изменёнными вариантами переводятся записью `migrations` «wh-rules 995 wargear» (`buildOptionRemap`; что не переводится —
  откладывается с предупреждением). Название оружия с «and» внутри («dart-bow and tri-blade») — одно оружие; «X and three
  of the following» — наборы из трёх с повторами (Kill Tank); предмет стандартного снаряжения с именем профиля
  («Kannon - Shell», «Combi-weapon - Damnatus») — оружие без профиля.
- Варианты, которые снимают отсутствующий предмет (P1-T5d; было 58 во всех армиях, осталось 1 — Venerable Dreadnought SM
  Legends: текст инфолиста противоречит сам себе). Разбор (`wargear.ts`): «X or Y» — подпункты с общим лимитом (заменяется
  то, что есть у модели); одинаковые апострофы; «have their X can be replaced» (Piranhas); снимаемый предмет назван иначе,
  чем в стандартном снаряжении («Furioso fists» ↔ «Twin Furioso fists», «ranged weapon» ↔ единственное стрелковое) —
  берётся единственный подходящий стандартный предмет. Данные (`whrules-995-wargear → loadoutRepair`,
  `whrules-wargear.mjs → repairLoadout`): стандартное снаряжение заново из текста loadout с предметами без профиля оружия
  (способности снаряжения и то, что заменяют варианты: slabshield, scattershield, crests, cluster bombs, collar of Khorne),
  перечнем после переноса строки, «is additionally equipped with», склейкой «pan spectral» ↔ «Panspectral» и
  «sniper rifle» ↔ «Scout sniper rifle» (`import-wahapedia.mjs → parseLoadout`) — только добавляет. rosterOptions `remove` —
  устаревшие или повторные варианты, которых нет у конструктора (Thunderhawk Gunship, Astraeus); `datasheets` — Knight
  Preceptor из полного снимка CSM и Imperial Knights, Cultist Mob with Firearms — стандартное снаряжение по конструктору
  (`loadout: 'roster'`: у инфолиста сайта ошибка). Тесты — `tests/paid-wargear.test.ts`.
- Правила детачментов, которые меняют игру, а не состав армии (ауры, стратагемы, перебросы), только показываются
  текстом — на ростер они не влияют.
- Если у инфолиста Space Marines несколько таблиц цен (варианты орденов), берётся первая.

## Age of Sigmar 4

Отдельная игровая система: свой импорт, свой движок правил, свои ключи хранения. Общие с 40K только UI-кит,
доступ по коду, хранилище Telegram и экспорт/импорт по коду (`AOS1.…`).

```
client/src/features/roster/aos/      движок AoS без React: types, rules (числа правил), engine (проверки), roster (операции), export
client/src/features/roster/ui/aos/   экраны AoS: список, редактор полков, выбор юнита с причинами, листы выбора, экспорт
backend/roster-data/aos/             index.json + f/<фракция>.json (GET /roster/data/aos/:name, только с доступом)
tools/roster-data/scripts/import-wahapedia-aos.mjs   CSV → backend/roster-data/aos
tools/roster-data/aos/curated.json   сезоны таблиц (Scourge of Ghyran истёк, Scourge of Aqshy действует), очки построений,
                                     улучшений, лоров и террейна (GW Battle Profiles, июль 2026), устаревшие таблицы
tools/roster-data/aos/eligibility.json  кому можно давать улучшения из таблиц с особыми условиями
tools/roster-data/aos/import-report.json  отчёт импорта: ошибки, предупреждения, заметки
tools/roster-data/tests/aos.test.ts  данные всех фракций + правила + полный перебор
tools/roster-data/tests/aos-structure.test.ts  сезоны, связи таблиц/лоров/правил, значения каста, видимость сезонных таблиц
tools/roster-data/tests/text.test.ts  тексты правил без разметки Wahapedia (данные AoS и 40K, клиент = импортёр)
tools/roster-data/scripts/repair-aos-data.mjs  повторить последнюю обработку импорта на готовых JSON (без CSV)
```

**Тексты правил.** В выгрузке Wahapedia встречается служебная разметка: ссылки `%000009837Redeploy%`,
теги `<KY>…</KY>`, дважды закодированные `&amp;emsp;`. Импорт чистит **все** текстовые поля правил одной функцией
(`cleanWahaText` в `import-wahapedia.mjs`, последний шаг — `normaliseAosFaction`) и считает остатки разметки ошибкой
импорта; клиент дополнительно чистит всё, что показывает (`client/src/features/roster/text.ts`, та же логика).
Исправили обработку, а свежей выгрузки нет — `node scripts/repair-aos-data.mjs` (с `--check` только покажет).

**Сезоны** перечислены в двух местах, которые проверяются тестом на совпадение: `aos/curated.json → seasonInfo`
(импорт: префикс имени, год General’s Handbook, действует ли) и `AOS_SEASONS` в `client/src/features/roster/aos/rules.ts`
(движок и интерфейс). Движок не знает имён сезонов — только `isSeasonal / seasonActive / seasonLabel`.
Новый сезон: добавить в оба места и переимпортировать; закончившийся — `active: false`. Сезон в данных, который нигде
не описан, роняет тест и в конструкторе не разрешается — он не может тихо пропасть или тихо появиться.

**Связи правил.** Если текст правила называет таблицу улучшений или лор фракции («Give that Hero 1 artefact of power
from the ‘Inventions of the Sky-ports’»), это видно в ростере: блок «Улучшения армии → Улучшения от способностей»
и ссылки «Даёт: …» под правилом (`aos/refs.ts`).

**Правила (General’s Handbook 2026-27, matched play)** — числа в `aos/rules.ts`:

- лимит 1000 или 2000 очков; на один юнит — не больше половины лимита;
- 1–5 полков: герой-лидер и 0–3 юнита (у генерала 0–4), юниты — только из вариантов полка лидера
  («Any X», «0-1 X», «X (required)», «0-1 A или B» — один слот); заметки Battle Profiles: «только в полку X»,
  «может присоединиться к полку X», «1 на каждый X», «не больше N … в полку героя без KW», «нельзя вместе с X»,
  «не занимает место в полку», «без других UNIQUE»;
- генерал — лидер полка; если в армии есть WARMASTER, генералом должен быть он;
- вспомогательные юниты: накопительная доплата +20, +40, +60…;
- усиление: вдвое больше моделей и очков, один раз; не для UNIQUE, одиночных моделей и «cannot be reinforced»;
- UNIQUE — один на армию; все копии юнита — одной версии (обычной или Scourge of Aqshy);
- полк славы — не больше одного, сверх 5 полков, только для разрешённых фракций; собираемые полки — по выбранным юнитам;
- одно построение, по одному лору заклинаний/молитв/манифестаций, не больше одного террейна фракции;
- улучшения: одно из каждой таблицы, у юнита — не больше одного каждого типа, без повторов, не UNIQUE,
  по условиям таблицы; таблица Scourge of Aqshy делит слот с обычной таблицей того же типа.

На главном экране ростера AoS — блоки «Заклинания и молитвы» (выбранные лоры заклинаний и молитв и свои заклинания
юнитов со значением каста; «Скрыть лоры» запоминается на устройстве), «Манифестации» (выбранный лор манифестаций:
каждое заклинание призыва в паре со своим варскроллом — `aos/refs.ts → manifestationsOf`; пара не нашлась — предупреждение)
и «Улучшения армии» (все таблицы вместе с сезонными, кто что взял, кому можно). Кнопка с глазом в шапке (40K и AoS)
включает режим просмотра: только чтение, без кнопок изменения.

**Очки** (тап по сумме очков в шапке, 40K и AoS) — `client/src/features/roster/points.ts`: очки сборки армии
раскладываются из существующих расчётов (`pointsOf`/`computeAos`, `computeRoster`) — второго расчёта нет; очки партии
(VP, CP) — справка с источником и редакцией. AoS: схема VP из General’s Handbook 2026-27 и счёт партии;
числа CP — по вторичному источнику (в выгрузке и на проверенных страницах правил их нет). 40K: VP миссий и доход CP
в данных нет — показано «нет данных».

**Террейн фракции** («Как ставить террейн фракции» в блоке армии и в листе выбора террейна) — `ui/aos/AosTerrainGuide.tsx`:
обязательное правило Core Rules 10.1 (`aos/terrain.ts`), правила самой фракции, которые ставят этот террейн
(боевые черты, построения и способности варскролла в фазе деплоя — `aos/refs.ts → terrainPlacementOf`, с расстояниями),
расстановка обычного террейна по General’s Handbook 2026-27 (зависит от батлпака) и схема-иллюстрация, подписанная
как неофициальная. Официальных схем и изображений расстановки в выгрузке нет. У 40K террейна фракции нет.

**Неполные тексты.** Поле `description` в выгрузке AoS обрезано на 1024 символах, а таблицы внутри правил не выгружаются
(`$000001417`). Импорт помечает такие правила `incomplete: "truncated" | "table"` (`rawIncomplete` в `import-wahapedia.mjs`),
интерфейс показывает предупреждение и кнопку «Полный текст на Wahapedia». Обрывок тега в конце обрезанного текста
и заглушка таблицы на экран не попадают. **Построения**: примечания подтипа (`notes`) и дата перехода в Warhammer Legends
(`legendsDate`, `legends`) берутся из `Faction_ability_subtypes.description`; построение, уже ушедшее в Legends, без показа
Legends не выбирается, а выбранное — предупреждение в проверке.

**Полные тексты (`aos/curated.json → fullTexts`).** Проверенные полные тексты правил, которые выгрузка обрезала или
выгрузила без таблицы. Запись: `name`, `in` (`"<фракция>|<владелец>"`: `ws:<варскролл>`, `trait`, `form:<построение>`,
`enh:<таблица>`, `lore:<лор>`, `ror:<полк славы>`), `text`, `source` (страница Wahapedia), `checked`. Текст = фрагмент
выгрузки до последнего целого слова + остаток с сайта; таблица — строка на строку, ячейки через « — ». `missing` —
правила, которые не восстановлены (на сайте другая редакция или источник сомнителен), с причиной; они остаются `incomplete` (с 17.10.2026 список пуст). Необязательное `note` — замечание о тексте сайта.
Подстановка — в `normaliseAosFaction` (`import-wahapedia-aos.mjs`), то есть и при импорте, и в `repair-aos-data.mjs`:
правило с `incomplete` заменяется, только если полный текст начинается с фрагмента выгрузки, а у правил с таблицей —
содержит все части фрагмента до и после таблицы (`fullTextFits`).
У подставленного правила нет `incomplete`, зато есть `textSource: "wahapedia-site"` — текст взят с сайта, а не из выгрузки.
Итог (сколько подставлено, что не подошло, что в `missing`) печатает импорт и repair; тесты — `tests/fulltexts.test.ts`. `repair-aos-data.mjs` также пересчитывает в `aos/import-report.json` строки о полных текстах, неполных текстах и юнитах без очков (`refreshAosReport`, остальное в отчёте — от импорта CSV).

**Правки варскроллов (`aos/curated.json → warscrollOverrides`).** Узкая схема для проверенных по источнику исправлений
выгрузки, тоже в `normaliseAosFaction`: `set.legends` (юнит из публикации Legends без заметки в выгрузке),
`set.setUpBy` (юнит не покупается — его ставит способность другого варскролла, очков нет по правилам), `copyFrom`
(сломанная строка выгрузки восстанавливается из того же варскролла другой фракции: свои id, фракция и ссылка остаются,
варианты полка пересчитываются по своей фракции). У каждой правки обязательны `why` и `source`; неизвестное поле
останавливает импорт. Там же `stale.factions` — предупреждение об устаревших правилах фракции (импорт и repair).
Тесты — `tests/aos-overrides.test.ts`.

**Legends по публикации.** Варскроллы из публикации GW «Legends Warscrolls» (в `Source.csv` — «Legends Warscrolls» и
«Darkwater Heroes - Legends Warscrolls») получают `legends: true` в `normaliseAosFaction` (`LEGENDS_PUBLICATION`):
в выгрузке признак есть только в заметке «Legends Warscroll», которой у большинства из них нет. Сверено с разделами
«Warhammer Legends» Battle Profiles 09.2026 (Kragnos — Legends только у Bonesplitterz). `index.json` (число доступных
юнитов, «только Legends») считается по готовым данным (`indexEntry`) — и импортом, и `repair-aos-data.mjs`.

**Официальные правки GW (`aos/curated.json → officialUpdates`).** Очки, ограничения, статус Legends и тексты правил из
Battle Profiles / Rules Updates, которых нет в выгрузке. Правка применяется, только если в данных `previous`; у каждой —
`ref`, `source`, `page`, `why`. Виды: `warscroll`, `options`, `weapon`, `points`, `enhancement` (по id улучшения: `name`,
`points`), `lore` (`legendsDate`), `rule` (`text` / `timing` / `value`; у правила с официальным текстом
`textSource: "gw-rules-updates"`), `ror`: `cost`, `legendsDate`, `allowedAdd` (запись полка и копии юнитов добавляются
в файлы `add`), `allowedRemove` и `withdrawn` (полк убирается из файлов `remove`, у фракции остаётся запись
`withdrawnRors` с причиной — сохранённый ростер показывает её вместо «не найден»). `reviewed` — исследованные вопросы
с решением и доказательством, `unresolved` — что открыто. Итог печатают импорт и repair; тесты —
`tests/aos-officialupdates.test.ts`. У полков славы и лоров `legendsDate` показывается подписью «Уйдёт в Legends …»;
уже ушедшие (`legends`) без показа Legends не выбираются.

Порядок источников данных и где лежит выгрузка Wahapedia (CSV + описание полей Excel) — в `CLAUDE.md` в корне репозитория.

Интерфейс не даёт сделать недопустимый выбор и показывает причину; ростер из кода или другого устройства
перепроверяется целиком (`computeAos`). Ростеры живут только на устройстве и в Telegram CloudStorage — сервер их
не принимает, поэтому серверной проверки ростера нет (как и у 40K); сервер отдаёт данные только пользователям с доступом.

**Не поддерживается:** Armies of Renown (в выгрузке их ограничения — только текстом), Spearhead и Path to Glory.
**Ogor Mawtribes и Sons of Behemat:** новые батлтомы (август и сентябрь 2026) заменили построения, черты, артефакты и лоры,
а в выгрузке от 25.08.2026 их ещё нет — старые таблицы помечены устаревшими, в ростере показывается предупреждение.
После свежей выгрузки снимите пометку в `curated.json → stale` и добавьте очки.

```bash
# CSV из выгрузки Wahapedia AoS положить в tools/roster-data/wahapedia-aos-csv/
npm run data:aos
npm test
```


## Kill Team (редакция 2024) — W2, 30.10.2026

Источник — открытый репозиторий [ktdash-v4-public](https://github.com/vjosset/ktdash-v4-public) (KTDash.app),
файл `prisma/seed-data.json`. Лицензии в репозитории нет — использование по решению владельца 30.10.2026.

```
tools/roster-data/scripts/import-ktdash.mjs <клон ktdash> [--check]   → backend/roster-data/kt/{index.json, t/<id команды>.json}
tools/roster-data/kt/import-report.json                              отчёт импорта
tools/roster-data/tests/kt-data.test.ts                              структура данных; сверка с клоном (KTDASH_DIR), если он есть
```

- id команд, оперативников, оружия, уловок и снаряжения — как в ktdash; коммит и дата источника — в `index.json → source`.
- Тексты правил — Markdown источника (**жирный**, таблицы, списки); правила оружия — строкой профиля («Rng 6", Lethal 5+»).
- Группа команды (`index.json → teams[].group`) — общие ключевые слова оперативников; для Tempestus Aquilon, Inquisitorial Agents и Elucidian Starstriders группы в ключевых словах нет — взята по меню Wahapedia (`GROUP_FALLBACK` в импорте). Exaction Squad, Imperial Navy Breachers и Sanctifiers — тоже «Agents of the Imperium», как на Wahapedia (решение владельца 30.10.2026, `GROUP_WAHAPEDIA`), хотя по ключевым словам у них свои группы.
- Фракция `SPEC` — наборы миссий и неигровые оперативники (`special: true`), не команды для обычной игры.
- Состав команды — текст источника (`composition`); универсального снаряжения в источнике нет.
- Сервер: `GET /roster/data/kt/:name` (`index` или id команды), только с доступом к WarpBuilder.

## Warcry — W4, 30.10.2026

Источник — открытый репозиторий [warcry_data](https://github.com/krisling049/warcry_data) (krisling049), папка `data/`
(Matched Play: бойцы, способности, фракции). Лицензии в репозитории нет — использование по решению владельца 30.10.2026.
Правила построения варбанды (3–15 бойцов, ≤1000 очков, ≤3 героев, группы Dagger/Shield/Hammer) — [warcrier.net](https://warcrier.net/docs/warbands), в W5.

```
tools/roster-data/scripts/import-warcry.mjs <клон warcry_data> [--check]  → backend/roster-data/warcry/{index.json, f/<id фракции>.json}
tools/roster-data/warcry/import-report.json                              отчёт импорта
tools/roster-data/tests/warcry-data.test.ts                              структура данных; сверка с клоном (WARCRY_DATA_DIR), если он есть
```

- id фракции — имя папки источника через дефис (`blades-of-khorne-bloodbound`); id бойцов и способностей — `_id` источника.
- Папки альянсов (`chaos`, `death`, `destruction`, `order`) — общие союзники, траллы и монстры (`generic: true`).
- Способности подфракций (bladeborn) лежат в файле родительской фракции с полем `subfaction`; способности монстров — с полем `monster`.
- Универсальные способности (Rush, Onslaught…) — в `index.json → universal`. Тексты — английский оригинал.
- 0 очков в источнике (Brimstone Horrors — появляются по ходу боя) сохраняются как есть и отмечены в отчёте.
- Сервер: `GET /roster/data/warcry/:name` (`index` или id фракции), только с доступом к WarpBuilder.

### Варбанда Warcry — W5, 30.10.2026

Модель и проверки — `client/src/features/roster/warcry/roster.ts`, экраны — `client/src/features/roster/ui/warcry/`,
тесты — `tools/roster-data/tests/warcry-roster.test.ts`. Правила построения — warcrier.net (The Warbands; Allies, Thralls and
Monsters; Bladeborn; страницы фракций): 3–15 бойцов, ≤1000 очков, лидер — первый боец, герой своей фракции; ≤3 героев;
союзники ≤2 (Hero/Ally другой фракции альянса), траллы ≤3, монстр 1 (один в группе); Bladeborn — по одному, спутники
героя-Bladeborn союзника вне лимита; «Heroes All» (флаги warcry_data). Код варбанды — `WC1.…`.

Конфликты источников (берётся warcrier, записано в `SINGLETON_OVERRIDES`):
- Blacktalons — warcrier: каждый боец один раз; warcry_data: `singleton: false`.
- Gladiatorium (Thunderstrike) — warcrier: каждый боец один раз; warcry_data: `singleton: false`.

### «Начать игру» и Test Army для Kill Team / Warcry (03.11.2026)

- `backend/roster-data/kt/game.json`: Approved Ops 2025 — 9 Crit Ops, 12 общих Tac Ops, Kill Grade, 4 turning points,
  initiative/primary op, 6 killzones по 6 официальных карт (36). Размер поля 30×22″, objective marker 40 мм, 2CP и до 4
  опций снаряжения. Источники — Wahapedia Approved Ops / Core Rules / Appendix / Killzones, проверка 03.11.2026.
  `scripts/import-kt-maps.py` векторизует drop zones, home/centre/enemy и контуры террейна из официальных схем; Approved Ops
  оговаривает, что карты не являются точными измерениями террейна.
- `backend/roster-data/warcry/game.json`: 24 deployment maps (Table A/B), 24 victory conditions и 18 актуальных twists,
  battleplan и резервы RND2/RND3. Источники — Warcrier Battleplan / Fighting the Battle / Matched Play, проверка 03.11.2026.
  `scripts/import-warcry-battleplans.py` импортирует тексты, `scripts/import-warcry-map-points.py` — группы Dagger/Shield/Hammer
  и метки резервов из официальных карт; внеполевые резервы проецируются на край доски.
- `client/src/features/roster/ktgame/` и `warcrygame/`: журналы событий с replay и undo, детерминированный RNG,
  подготовка, CP/Kill Grade/Crit Op, initiative и wild dice, активации/способности, резервы, завершение и primary op.
  Очки по уникальным Tac Op / victory conditions подтверждаются игроком по полному тексту правила — универсальная механика
  не выдумывается. Тесты — `tests/kt-game-full.test.ts` и `tests/warcry-game-full.test.ts`.
- Экраны `ui/kt/KtFullGameScreen` и `ui/warcry/WarcryFullGameScreen`: ростеры и миссия/battleplan, журнал и продолжение,
  игра на двух телефонах по общему roster-games API (`ui/skirmish/useSkirmishOnline`), миграция ранней локальной версии
  как новой подготовки без фабрикации прежнего ручного счёта.
- Test Army использует общий `Board`: 30×22″ для этих систем, прежние 60×44″ для 40K/AoS. Каждый оперативник/боец —
  отдельная модель; базы Kill Team — из datacard KTDash. В `warcry_data` размера базы нет, поэтому игрок задаёт её вручную.
  Kill Team — все 36 официальных карт; Warcry — все 24 deployment maps с точками групп и зонами 3″. Соперник — второй
  сохранённый ростер или код KT1./WC1.; расстановка сохраняется отдельно для системы, аккаунта и ростера.
