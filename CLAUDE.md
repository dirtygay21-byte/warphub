# WarpHub — инструкции для работы с репозиторием

Mini App WarpHub (Telegram) и скрытый раздел Roster Builder (Warhammer 40,000 и Age of Sigmar).
Подробности по данным ростера: `tools/roster-data/README.md`.

## Ветки и выкладка

- Рабочая ветка — `release/all-in-one` (она на production). `main` не сливать без явного разрешения.
- На production ничего не выкладывать и не перезапускать без явного разрешения владельца.

## Данные ростера: порядок поиска источника (обязательно для любой работы с данными ростера)

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
(последняя проверенная: AoS 2026-08-25 14:30, 40K 2026-09-28 02:38). Большие данные в инструкции не копировать.

### Что важно знать о выгрузке (из спецификации и проверки CSV)

- AoS: поле `description` обрезано выгрузкой на **1024 символах** (длина 1023 — срезан хвостовой пробел).
  Импорт помечает такие правила `incomplete: "truncated"`, интерфейс показывает предупреждение и ссылку на полный текст.
- AoS: таблицы в правилах не выгружаются — вместо них `$000001417`; помечается `incomplete: "table"`.
- AoS: `Faction_ability_subtypes.description` — примечания подтипа (например, дата перехода построения в Warhammer Legends).
- 40K: лимита длины нет; ссылка-заглушка `$…` встречается единично.
- Очков сезонных таблиц, построений, лоров и террейна AoS в CSV нет — они в `curated.json` (Battle Profiles).

## Проверки

```bash
cd tools/roster-data && bun test tests/          # движки, данные, сверка с CSV (если папка CSV есть)
cd client && npx tsc -p tsconfig.app.json --noEmit && npx eslint src/features/roster
```
