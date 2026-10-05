# WarpHub · Roster Builder

Внутренний конструктор ростеров **Warhammer 40,000, 11-я редакция** для Telegram Mini App WarpHub.
Отдельный модуль (Vite + React + Tailwind, тёмная тема и лаймовый акцент как в основном приложении), который
можно открыть как самостоятельную страницу или позже перенести в `warphub-client` как раздел.

Данные: **powered by Wahapedia** (Export Data, `wh40k11ed`). Только для личного некоммерческого использования.

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
  Titanic Support, Daemonic Pact (лимит очков и правило BATTLELINE по богам).

## Запуск

```bash
cd roster-builder
npm install
npm run dev          # http://localhost:5173
npm test             # тесты движка (node:test + tsx)
npm run build        # dist/ — статика
```

Готовые данные уже лежат в `public/data/` (выгрузка Wahapedia от 2026-09-28).

## Обновление данных

```bash
# из скачанных CSV (положить в roster-builder/wahapedia-csv/)
npm run data

# или скачать свежие с Wahapedia (только если изменился Last_update.csv)
npm run data:fetch && npm run build
```

Нужные файлы: `Factions, Source, Datasheets, Datasheets_keywords, Datasheets_models, Datasheets_unit_composition,
Datasheets_models_cost, Datasheets_enhancements, Datasheets_leader, Enhancements, Detachment_abilities, Detachments,
Detachments_chapter_dp, Last_update, Abilities, Datasheets_abilities, Datasheets_wargear, Datasheets_options, Stratagems,
Datasheets_stratagems, Datasheets_detachment_abilities` — то есть вся выгрузка Wahapedia. На сервере можно повесить на cron раз в сутки, например:

```cron
30 4 * * * cd /srv/warphub/roster-builder && npm run data:fetch && npm run build >> /var/log/roster-data.log 2>&1
```

Импортёр: `scripts/import-wahapedia.mjs` (без зависимостей). Колонки читаются по имени, а не по позиции.

## Деплой за Nginx (рядом с Mini App)

```nginx
location /roster/ {
    alias /srv/warphub/roster-builder/dist/;
    try_files $uri $uri/ /roster/index.html;
    gzip on; gzip_types application/json text/css application/javascript;
    # личный инструмент — закрыть от посторонних:
    # auth_basic "WarpHub"; auth_basic_user_file /etc/nginx/.htpasswd-roster;
}
```

Открыть из бота: кнопка меню / inline-кнопка `web_app` с URL `https://<домен>/roster/`.
Мягкое ограничение по Telegram-логину: `VITE_ALLOWED_USERNAMES=KorenevEgor npm run build`
(это клиентская проверка; настоящая защита — Nginx или проверка `initData` на бэкенде).

## Структура

```
scripts/import-wahapedia.mjs   CSV → public/data/index.json + public/data/f/<фракция>.json
src/engine/                    чистая логика без React (можно переиспользовать в бэкенде)
  rules.ts                     числа правил (размеры боя, DP, лимиты, союзники) — правьте здесь
  compute.ts                   стоимость и проверка ростера
  export.ts                    текстовые форматы
  roster.ts                    операции с ростером, код WH1
src/ui/                        экраны: список, редактор, выбор юнита, экспорт
src/storage.ts                 CloudStorage + localStorage
tests/engine.test.ts           тесты на реальных данных
```

## Известные ограничения

- Значения, помеченные «≈» в `src/engine/rules.ts`, взяты из вторичных источников: бюджет DP для Onslaught,
  лимит Dedicated Transport и очковые лимиты для юнитов, разрешённых детачментом (там это **предупреждения**).
- Варианты замены оружия в Wahapedia — свободный текст, поэтому их соблюдение не проверяется автоматически:
  число оружия задаётся вручную, а текст вариантов показан рядом. Доплата за оружие («per Thunder Hammer»)
  отмечается отдельным счётчиком.
- Детачменты, которые разрешают юниты поимённым списком (Shadow Legion, Questor Forgepact), пока не добавляют
  эти юниты автоматически.
- Если у инфолиста Space Marines несколько таблиц цен (варианты орденов), берётся первая.
