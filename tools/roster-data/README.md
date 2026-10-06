# WarpHub · Roster Builder — данные и тесты

Roster Builder — скрытый раздел Mini App WarpHub: конструктор ростеров **Warhammer 40,000, 11-я редакция**.
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
- Варианты замены оружия в Wahapedia — свободный текст, поэтому их соблюдение не проверяется автоматически:
  число оружия задаётся вручную, а текст вариантов показан рядом. Доплата за оружие («per Thunder Hammer»)
  отмечается отдельным счётчиком.
- Правила детачментов, которые меняют игру, а не состав армии (ауры, стратагемы, перебросы), только показываются
  текстом — на ростер они не влияют.
- Если у инфолиста Space Marines несколько таблиц цен (варианты орденов), берётся первая.
