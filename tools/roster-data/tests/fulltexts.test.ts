// Полные тексты правил AoS из aos/curated.json → fullTexts (обрезанные выгрузкой на 1024 символах). Запуск: npm test
// 1) механизм подстановки (normaliseAosFaction / fullTextFits / fullTextReport) — на маленьких искусственных данных;
// 2) регрессия по настоящим данным: подставленные тексты на месте, удержанные (missing) правила не тронуты.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fullTextFits, fullTextReport, normaliseAosFaction, refreshAosReport, rulesWithOwner } from '../scripts/import-wahapedia-aos.mjs';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');
const AOS = path.join(ROOT, 'backend', 'roster-data', 'aos');
const curated = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'aos', 'curated.json'), 'utf8'));
const sha = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16);

// ---------- механизм на искусственных данных ----------

const FULL = 'Declare: Pick a visible enemy unit within 12" of this unit to be the target.\n\nEffect: Roll a dice. On a 3+, inflict D3 mortal damage on the target.';
const CUT = 'Declare: Pick a visible enemy unit within 12" of this unit to be the target.\n\nEffect: Roll a dice. On a 3+, inflict D3 mor';

type Rule = { name: string; text: string; incomplete?: string; textSource?: string };
function faction(id: string, rules: { ws?: Rule[]; trait?: Rule[]; enh?: Rule[] }) {
  return {
    id,
    warscrolls: [{ id: 'w1', name: 'Test Hero', abilities: rules.ws ?? [], weapons: [], notes: '' }],
    rorUnits: [],
    universalManifestations: [],
    battleTraits: rules.trait ?? [],
    formations: [],
    enhancementTypes: [{ key: 'heroic', name: 'Heroic Traits', tables: [{ id: 't1', name: 'Test Traits', items: rules.enh ?? [] }] }],
    lores: [],
    rors: [],
  };
}
const cur = (items: object[], missing: object[] = []) => ({ seasons: {}, fullTexts: { checked: '2026-10-16', items, missing } });
const truncated = (name: string, text = CUT): Rule => ({ name, text, incomplete: 'truncated' });

test('fullTexts: обрезанное правило получает полный текст, пометка снимается, источник записывается', () => {
  const d = faction('XX', { ws: [truncated('Smite')] });
  normaliseAosFaction(d, cur([{ name: 'Smite', in: ['XX|ws:Test Hero'], text: FULL }]));
  const r = d.warscrolls[0]!.abilities[0]!;
  assert.equal(r.text, FULL);
  assert.equal(r.incomplete, undefined);
  assert.equal(r.textSource, 'wahapedia-site');
});

test('fullTexts: текст другой редакции (не продолжает обрывок) не подставляется', () => {
  const other = 'Declare: Pick a visible enemy unit within 18" of this unit to be the target.\n\nEffect: Inflict 1 mortal damage on the target.';
  const d = faction('XX', { ws: [truncated('Smite')] });
  normaliseAosFaction(d, cur([{ name: 'Smite', in: ['XX|ws:Test Hero'], text: other }]));
  const r = d.warscrolls[0]!.abilities[0]!;
  assert.equal(r.text, CUT);
  assert.equal(r.incomplete, 'truncated');
  assert.equal(r.textSource, undefined);
});

test('fullTexts: подстановка только по ключу «фракция|владелец|правило» и только для неполных правил', () => {
  const d = faction('XX', {
    ws: [{ name: 'Smite', text: 'Effect: complete text.' }], // полное правило с тем же именем — не трогаем
    trait: [truncated('Smite')], // другой владелец — ключа нет
    enh: [truncated('Smite')],
  });
  normaliseAosFaction(d, cur([{ name: 'Smite', in: ['XX|enh:Test Traits', 'YY|ws:Test Hero'], text: FULL }]));
  assert.equal(d.warscrolls[0]!.abilities[0]!.text, 'Effect: complete text.');
  assert.equal(d.warscrolls[0]!.abilities[0]!.textSource, undefined);
  assert.equal(d.battleTraits[0]!.incomplete, 'truncated');
  assert.equal(d.enhancementTypes[0]!.tables[0]!.items[0]!.text, FULL);
});

test('fullTexts: повторная обработка ничего не меняет', () => {
  const c = cur([{ name: 'Smite', in: ['XX|ws:Test Hero'], text: FULL }]);
  const once = JSON.stringify(normaliseAosFaction(faction('XX', { ws: [truncated('Smite')] }), c));
  assert.equal(JSON.stringify(normaliseAosFaction(JSON.parse(once), c)), once);
});

test('fullTextFits: обрывок сравнивается без учёта регистра и разметки, лишнее начало не подходит', () => {
  assert.ok(fullTextFits(CUT, { name: 'x', text: FULL }));
  assert.ok(fullTextFits(CUT.replace('mor', 'MORT'), { name: 'x', text: FULL.toUpperCase() }));
  assert.ok(!fullTextFits('Effect: something else entirely', { name: 'x', text: FULL }));
});

test('fullTextReport: число подстановок, неподошедшие тексты и удержанные правила', () => {
  const d = faction('XX', { ws: [truncated('Smite')], trait: [truncated('Curse')] });
  const c = cur(
    [
      { name: 'Smite', in: ['XX|ws:Test Hero'], text: FULL },
      { name: 'Curse', in: ['XX|trait'], text: 'Effect: a different rule.' },
    ],
    [{ in: 'XX|trait', name: 'Curse', why: 'conflict' }],
  );
  normaliseAosFaction(d, c);
  const lines = fullTextReport({ 'XX.json': d }, c).join('\n');
  assert.match(lines, /подставлено 1\b/);
  assert.match(lines, /не подставлен[^\n]*XX\|trait «Curse»/); // текст не подошёл — в отчёте
  assert.match(lines, /полного текста нет: XX\|trait «Curse» — conflict/);
});

// ---------- регрессия по настоящим данным ----------

const ft = curated.fullTexts;
const data: Record<string, any> = Object.fromEntries(
  fs.readdirSync(path.join(AOS, 'f')).filter((f) => f.endsWith('.json')).map((f) => {
    const d = JSON.parse(fs.readFileSync(path.join(AOS, 'f', f), 'utf8'));
    return [d.id, d];
  }),
);
const find = (ref: string, name: string) => {
  const [fac, owner] = ref.split('|');
  return [...rulesWithOwner(data[fac!])].filter(([o, r]) => o === owner && r.name === name).map(([, r]) => r);
};

test('fullTexts в curated: обход проверки редакции (revised) не используется, у каждого текста есть источник', () => {
  for (const it of ft.items) {
    assert.equal(it.revised, undefined, `${it.name}: revised без отдельного одобрения запрещён`);
    // источник — страница Wahapedia; если её нет (404), BSData (решение владельца 30.10.2026: BSData/Sigdex — второй источник)
    assert.match(it.source, /^https:\/\/(wahapedia\.ru\/aos4\/|github\.com\/BSData\/age-of-sigmar-4th )/, it.name);
    assert.ok(it.in.length > 0, it.name);
  }
  // выгрузка 2026-10-22: 155 текстов (239 записей) — обрезанные лимитом 1024 символа и с восстановленными таблицами;
  // 24 текста добавлены 30.10.2026 (новые батлтомы OM и SoB, изменённые правила), 2 текста полков славы — из BSData
  assert.equal(ft.items.length, 155);
  assert.equal(ft.items.reduce((n: number, it: { in: string[] }) => n + it.in.length, 0), 239);
});

const officialText = (ref: string, name: string) =>
  curated.officialUpdates?.items.find((i: { kind: string; field: string; ruleName?: string; owners?: string[] }) => i.kind === 'rule' && i.field === 'text' && i.ruleName === name && i.owners!.includes(ref));

test('данные AoS: все 239 записей из fullTexts получили полный текст из curated', () => {
  let n = 0;
  for (const it of ft.items)
    for (const ref of it.in) {
      const recs = find(ref, it.name);
      assert.equal(recs.length, 1, `${ref} «${it.name}»: ожидалась ровно одна запись`);
      const r = recs[0]!;
      // текст заменён официальной правкой GW (curated.officialUpdates): в данных — её значение, а заменён был именно восстановленный текст
      const ou = officialText(ref, it.name);
      if (ou) assert.equal(ou.previous, it.text, `${ref} «${it.name}»: правка заменяет не восстановленный текст`);
      assert.equal(r.text, ou ? ou.value : it.text, `${ref} «${it.name}»`);
      assert.equal(r.incomplete, undefined, `${ref} «${it.name}»`);
      // источник текста — официальная правка, если она заменила восстановленный текст (SONG OF THE LOST, DIRTY TRICKS)
      assert.equal(r.textSource, ou ? 'gw-rules-updates' : 'wahapedia-site', `${ref} «${it.name}»`);
      n++;
    }
  assert.equal(n, 239);
});

// OUTPUT TO MAXIMUM! (удерживался 16.10.2026): восстановлен 17.10.2026 — текст сайта Wahapedia дословно, без знака дюйма,
// которого нет и на сайте. Хэш — обрезанный текст выгрузки, к которому дописан только хвост.
const HELD_RESTORED: [string, string, string][] = [
  ['CoS|ws:Linebreaker Cogfort', 'OUTPUT TO MAXIMUM!', 'c5b17d806b92f0a4'],
];
// Конфликты (на сайте другая редакция): Rules Updates GW 23.09.2026 подтвердили редакцию сайта — в данных официальный текст
// (curated.officialUpdates, Stage A), пометки «неполный» нет. Хэш — текст выгрузки 2026-10-22, который заменён.
// FERAL RUIN (A415) убран 30.10.2026: у построения Despoilers этой способности больше нет (curated → officialUpdates.reviewed).
const OFFICIAL: [string, string, string, string][] = [
  ['OB|ws:Katakros, Mortarch of the Necropolis', 'Supreme Lord of the Bonereaper Legions', '4e4fdc26140963ad', 'A412'],
  ['NT|ws:Lord Vitriolic', 'Spectral Alchemy', 'a4d29ad110c070f1', 'A406'],
  ['SG|ws:Scourge of Aqshy Vengorian Lord', 'Frenzied Surge', '8945ee0dfccd8e29', 'A422'],
];

test('данные AoS: удержанных правил нет (OUTPUT TO MAXIMUM! восстановлен), конфликты заменены официальным текстом GW', () => {
  assert.deepEqual(ft.missing, []);
  const restored = new Map(ft.items.flatMap((it: { in: string[]; name: string; text: string }) => it.in.map((ref) => [`${ref}|${it.name}`, it.text])));
  for (const [ref, name, hash] of HELD_RESTORED) {
    const full = restored.get(`${ref}|${name}`);
    assert.ok(full, `${ref} «${name}» должен быть в fullTexts.items`);
    const cut = full.slice(0, full.indexOf('Move char') + 'Move char'.length);
    assert.equal(sha(cut), hash, `${ref} «${name}»: начало должно совпадать с текстом выгрузки`);
    assert.ok(full.endsWith('2 - Full Throttle!: This unit’s Move characteristic is 10'), `${ref} «${name}»`);
    const recs = find(ref, name);
    assert.equal(recs.length, 1, `${ref} «${name}»`);
    assert.equal(recs[0]!.incomplete, undefined, `${ref} «${name}»`);
    assert.equal(recs[0]!.textSource, 'wahapedia-site', `${ref} «${name}»`);
    assert.equal(recs[0]!.text, full, `${ref} «${name}»`);
  }
  for (const [ref, name, hash, planRef] of OFFICIAL) {
    assert.ok(!restored.has(`${ref}|${name}`), `${ref} «${name}» не должен быть в fullTexts.items`);
    const ou = officialText(ref, name);
    assert.ok(ou, `${ref} «${name}»: нет правки в curated.officialUpdates`);
    assert.equal(ou.ref, planRef, `${ref} «${name}»`);
    assert.equal(ou.source, 'RU-2026-09', `${ref} «${name}»`);
    assert.equal(ou.clearIncomplete, true, `${ref} «${name}»`);
    assert.equal(sha(ou.previous), hash, `${ref} «${name}»: правка заменяет не тот текст`);
    const recs = find(ref, name);
    assert.equal(recs.length, 1, `${ref} «${name}»`);
    assert.equal(recs[0]!.incomplete, undefined, `${ref} «${name}»`);
    assert.equal(recs[0]!.textSource, 'gw-rules-updates', `${ref} «${name}»`);
    assert.equal(recs[0]!.text, ou.value, `${ref} «${name}»`);
  }
});

test('данные AoS: отчёт подстановки без неподошедших текстов', () => {
  const lines = fullTextReport(Object.fromEntries(Object.entries(data).map(([id, d]) => [`${id}.json`, d])), curated);
  assert.ok(lines.some((l) => /подставлено 239\b/.test(l)), lines.join('\n'));
  assert.ok(!lines.some((l) => l.startsWith('полный текст из curated не подставлен')), lines.join('\n'));
  // восстановленный текст затем заменён официальной правкой GW — отдельной строкой, а не как «не подставлен»
  assert.ok(lines.includes('полный текст затем заменён официальной правкой GW (officialUpdates): KB|trait «DIRTY TRICKS»; SY|lore:Lore of the Spirit-Song «SONG OF THE LOST»'), lines.join('\n'));
});

// ---------- таблицы правил AoS (вместо заглушки «$000001417» в выгрузке) ----------

const TABLE_RULES: [string, string][] = [
  ['ST|ws:Hell Pit Abomination', 'Too Horrible To Die'],
  ['ST|ws:Grey Seer on Screaming Bell', 'Peal of Doom'],
  ['HS|ws:Fane of Slaanesh', 'Damned Conduit'],
  ['OB|ws:Bone-tithe Nexus', 'Deadly Aura'],
  ['HoH|ws:Urak Taar, the First Daemonsmith', 'Peerless Among Daemonsmiths'],
  ['HoH|ws:Daemonsmith on Infernal Taurus', 'Daemonic Resilience'],
  ['HoH|ws:Infernal Cohort with Hashutite Spears', 'Daemonic Resilience'],
  ['HoH|ws:Infernal Cohort with Hashutite Blades', 'Daemonic Resilience'],
  ['HoH|ws:The Blood of the Bull', 'Infernal Empowerment'],
  ['HoH|ws:Scourge of Ghyran Infernal Cohort with Hashutite Blades', 'Daemonic Resilience'],
  // выгрузка 2026-10-22: у Scourge of Aqshy Endrinriggers вместо «Emergency Field Repairs» правило «We're Working Here!» (тоже с таблицей)
  ['KO|ws:Scourge of Aqshy Endrinriggers', "We're Working Here!"],
  ['BoK|ws:Scourge of Aqshy Blood Warriors', 'Only the Worthy'],
  ['HoH|ws:Scourge of Aqshy Daemonsmith on Infernal Taurus', 'Daemonic Resilience'],
  ['HoH|ws:Scourge of Aqshy Anointed Sentinels', 'Daemonic Resilience'],
  ['StD|ws:Scourge of Aqshy Chaos Warriors', 'For the glory of the Dark Gods'],
  ['KB|trait', 'DIRTY TRICKS'],
  ['KB|enh:Kunnin’ Creatures', 'SPITTIN’ ’UN'],
  ['LRL|trait', 'DEPICT RUNE'],
  ['ST|form:Warpcog Convocation', 'Skryre Prototypes'],
  ['ST|form:Fleshmeld Menagerie', 'Prized Creations'],
  ['SY|trait', 'THE CREEPING OVERGROWTH'],
];
const record = (ref: string, name: string) => {
  const recs = find(ref, name);
  assert.equal(recs.length, 1, `${ref} «${name}»`);
  return recs[0]!;
};
// строки в тексте идут в заданном порядке (каждая — целиком, после предыдущей)
const inOrder = (text: string, lines: string[], what: string) => {
  let at = -1;
  for (const l of lines) {
    const i = text.indexOf(l, at + 1);
    assert.ok(i > at, `${what}: нет строки или нарушен порядок — «${l}»`);
    at = i;
  }
};

test('таблицы AoS: все 21 запись восстановлены, без заглушек и пометки «нет таблицы»', () => {
  const items = new Map(ft.items.flatMap((it: { in: string[]; name: string; text: string }) => it.in.map((ref) => [`${ref}|${it.name}`, it.text])));
  for (const [ref, name] of TABLE_RULES) {
    const r = record(ref, name);
    const ou = officialText(ref, name); // DIRTY TRICKS: Rules Updates 09.2026 убрали первое предложение — таблица остаётся
    assert.equal(r.incomplete, undefined, `${ref} «${name}»`);
    assert.equal(r.textSource, ou ? 'gw-rules-updates' : 'wahapedia-site', `${ref} «${name}»`);
    assert.equal(r.text, ou ? ou.value : items.get(`${ref}|${name}`), `${ref} «${name}»`);
    if (ou) assert.equal(ou.previous, items.get(`${ref}|${name}`), `${ref} «${name}»`);
    assert.ok(!/\$\d{6,}/.test(r.text), `${ref} «${name}»: осталась заглушка таблицы`);
  }
  // и во всех данных AoS больше нет правил с невыгруженной таблицей
  for (const d of Object.values(data)) for (const [o, r] of rulesWithOwner(d)) assert.notEqual(r.incomplete, 'table', `${d.id}|${o} «${r.name}»`);
});

test('таблицы AoS: «Daemonic Resilience» одинаков во всех 6 записях', () => {
  const texts = TABLE_RULES.filter(([, n]) => n === 'Daemonic Resilience').map(([ref, n]) => record(ref, n).text);
  assert.equal(texts.length, 6);
  assert.equal(new Set(texts).size, 1);
  inOrder(texts[0]!, [
    '(DPP) this unit has:',
    'DPP — Effect',
    '1 — This unit has WARD (6+).',
    '2 — This unit has WARD (5+).',
    '3 — This unit has WARD (4+) against damage inflicted by SPELLS, PRAYERS and abilities used by MANIFESTATIONS. Otherwise, it has WARD (5+).',
  ], 'Daemonic Resilience');
});

test('таблицы AoS: строки таблиц — «ячейка — ячейка», заголовок первой строкой', () => {
  inOrder(record('HS|ws:Fane of Slaanesh', 'Damned Conduit').text, ['Battle Round — X', '1 — 9"', '2 — 12"', '3 — 15"', '4 — 18"', '5 — 21"'], 'Damned Conduit');
  inOrder(record('KB|trait', 'DIRTY TRICKS').text, ['Dirty Trick — Dirty Trick Roll', 'First — 2+', 'Second — 3+', 'Third — 4+', 'Fourth or subsequent — 5+'], 'DIRTY TRICKS');
  inOrder(record('ST|ws:Hell Pit Abomination', 'Too Horrible To Die').text, ['1 — Dead: This unit is destroyed.', '2-4 — The Rats Emerge:', '5-6 — It’s Alive!:'], 'Too Horrible To Die');
  inOrder(record('BoK|ws:Scourge of Aqshy Blood Warriors', 'Only the Worthy').text, ['1+ — ', '4+ — ', '8+ — ', '16+ — Double the Attacks characteristic'], 'Only the Worthy');
});

test('таблицы AoS: «SPITTIN’ ’UN» — профиль оружия один раз, без мобильной копии', () => {
  const t = record('KB|enh:Kunnin’ Creatures', 'SPITTIN’ ’UN').text;
  inOrder(t, ['where X is equal to your fury level.', 'RANGED WEAPONS — Rng — Atk — Hit — Wnd — Rnd — Dmg', 'Caustic Saliva — 12" — X — 4+ — 3+ — 2 — D3'], 'SPITTIN’ ’UN');
  assert.equal(t.split('Caustic Saliva').length - 1, 1, 'профиль оружия должен быть один раз');
});

test('таблицы AoS: «DEPICT RUNE» — 5 рун по порядку со списками усилений, затем Designer’s Note', () => {
  const t = record('LRL|trait', 'DEPICT RUNE').text;
  inOrder(t, [
    'Pick 1 of the following runes',
    'Varinor, Rune of Strength:',
    '• While Ydriliqi, Rune of the River is depicted',
    '• While Oreali, Rune of the Wind is depicted',
    'Alaithi, Rune of the Mountain:',
    '• While Varinor, Rune of Strength is depicted',
    '• While Ydriliqi, Rune of the River is depicted',
    'Ydriliqi, Rune of the River:',
    '• While Alaithi, Rune of the Mountain is depicted',
    '• If Oreali, Rune of the Wind is depicted',
    'Oreali, Rune of the Wind:',
    '• While Varinor, Rune of Strength is depicted',
    '• While Alaithi, Rune of the Mountain is depicted',
    'Thalari, Rune of the Zenith:',
    'Designer’s Note: We recommend noting the runes',
  ], 'DEPICT RUNE');
  assert.ok(t.endsWith('learn to draw each rune!'));
});

test('таблицы AoS: «THE CREEPING OVERGROWTH» — таблица между текстом и Designer’s Note', () => {
  const t = record('SY|trait', 'THE CREEPING OVERGROWTH').text;
  inOrder(t, ['as shown:', 'Overgrown Tokens — Creeping Overgrowth Range', '0-2 — 6"', '3-5 — 9"', '6-8 — 12"', '9+ — Whole battlefield', 'Designer’s Note: Awakened Wyldwoods'], 'THE CREEPING OVERGROWTH');
});

// ---------- отчёт импорта по готовым данным (repair-aos-data.mjs → refreshAosReport) ----------

test('отчёт импорта соответствует данным: полные тексты, неполные тексты, юниты без очков; пересчёт не меняет его', () => {
  const report = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'aos', 'import-report.json'), 'utf8'));
  const files = Object.fromEntries(fs.readdirSync(path.join(AOS, 'f')).filter((f) => f.endsWith('.json')).map((f) => [f, JSON.parse(fs.readFileSync(path.join(AOS, 'f', f), 'utf8'))]));
  assert.deepEqual(refreshAosReport(report, files, curated), report, 'отчёт устарел — запустите scripts/repair-aos-data.mjs');
  assert.deepEqual(report.exportIncomplete, { truncated: 221, table: 21 }); // выгрузка 2026-10-22
  // все обрезанные и без таблицы восстановлены (сайт Wahapedia, 2 полка славы — BSData) или заменены официальным текстом GW (Stage A)
  assert.ok(report.info.includes('полные тексты восстановлены: обрезанных — 221 из 221, без таблицы — 21 из 21'));
  assert.ok(!report.warnings.some((l: string) => l.startsWith('неполные тексты в выгрузке:')), 'неполных текстов больше нет');
  assert.equal(report.info.filter((l: string) => l.startsWith('полного текста нет: ')).length, curated.fullTexts.missing.length);
  // юнит с ценой или Legends не числится «без очков»; Auto-Endrin — «очков нет по правилам»
  for (const l of report.info.filter((x: string) => / — нет очков в Battle Profiles/.test(x))) {
    const [fid, name] = [l.split(':')[0], l.match(/«(.+?)»/)![1]];
    const w = files[`${fid}.json`].warscrolls.find((x: { name: string }) => x.name === name);
    assert.ok(w && w.cost == null && !w.legends, l);
  }
  assert.ok(report.info.some((l: string) => l.startsWith('KO: «Auto-Endrin» — очков нет по правилам')));
});
