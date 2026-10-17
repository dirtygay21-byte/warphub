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

Резолвер геометрии взят из 40kdc-data (`vendor/40kdc-resolve.ts`, MIT). В приложении обязательна подпись
«Powered by 40kdc-data» со ссылкой на https://40kdc.alpacasoft.dev — она стоит внизу экрана «Поле боя».

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
  Платное снаряжение (Killsaw +5 и т.п.) считается по выбранным заменам автоматически.
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
