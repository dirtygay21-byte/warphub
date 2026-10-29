# AoS: свежесть данных (S1, 30.10.2026)

Источники: выгрузка Wahapedia **2026-10-22 18:12:05** (было 2026-08-25), BSData `age-of-sigmar-4th` rev 105, commit 6909c14
(2026-10-23; его показывает sigdex.io), официальные документы GW из `curated.json → officialUpdates`.

## Что изменилось

- **Ogor Mawtribes** (батлтом, июль 2026) и **Sons of Behemat** (батлтом, сентябрь 2026): в выгрузке появились новые
  построения, черты, артефакты, лоры и Realm-Shaking Rampages; пометка «правила устарели» снята. Новые юниты: OM — Morga,
  Redd the Maw, Grell Firefist, Tyrant on Glutthorn, Maulbeast Cavalry/Raiders, Hunters with Sabrefangs, Cleavers, Gutseers;
  SoB — Ma Maegran, Rock-hurlers, Boss-Stompers, Ancient Ghyrochs (Mancrusher Mob убран). Новые цены, например Ironblaster
  160 → 180, Mega-Gargants 410–490 → 370–400, King Brodd 520 → 430.
- Полки славы: Krong the Club (140) теперь в выгрузке — вопрос A216 закрыт.
- 66 изменений очков юнитов по всем фракциям, правки текстов и вариантов полка (подробности — в git diff `backend/roster-data/aos`).
- Официальные правки: 377 из 377 применены. Для 17 правок `previous` переписан на значение новой выгрузки (официальное
  значение не менялось); A415 FERAL RUIN убрана — у построения Despoilers теперь «YOU WILL SERVE!» (Wahapedia и BSData).
- Полные тексты: добавлено 24 с сайта Wahapedia и 2 из BSData (страницы полков Bundo Whalebiter и Okar’s Torrbad на
  Wahapedia отдают 404); обрезанных текстов в данных не осталось.
- Импорт: «can join the regiment of A, the B, or C» — имена берутся из `<b>` (в именах есть запятые).

## Сверка очков с BSData (`aos/bsdata-compare.json`)

953 юнита совпадают, 3 расходятся — оставлены по Wahapedia, нужен официальный документ:

| Юнит | Wahapedia | BSData |
|---|---|---|
| DoK Khainite Shadowstalkers | 130 | 100 |
| SoB Scourge of Aqshy Gatebreaker Mega-Gargant | 490 | 400 |
| SoB Scourge of Aqshy Mancrusher Gargant | 120 | 150 |

Остальное «только у нас / только в BSData» — разные написания имён (Korghos/Khorgos Khul, Hobgrotz/Hobgrot Vandalz,
Kurnoth Hunters…), Legends и Armies of Renown.

## Батлпланы

Счёт всех 12 батлпланов в `battlepack.json` совпадает с Sigdex. Карты (цели, террейн, территории в дюймах) сохранены в
`aos/sigdex-battleplans-2026-27.json` для S3; приложение их пока не использует.

## Открыто

- 3 расхождения очков выше; BoC «Bestial Manifestations» без очков; KB «Hobgrot Slittaboss» вариант «Monster»; A449 Khazalite Holds.
