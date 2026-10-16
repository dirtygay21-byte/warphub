// Полные тексты правил AoS из aos/curated.json → fullTexts (обрезанные выгрузкой на 1024 символах). Запуск: npm test
// 1) механизм подстановки (normaliseAosFaction / fullTextFits / fullTextReport) — на маленьких искусственных данных;
// 2) регрессия по настоящим данным: подставленные тексты на месте, удержанные (missing) правила не тронуты.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fullTextFits, fullTextReport, normaliseAosFaction, rulesWithOwner } from '../scripts/import-wahapedia-aos.mjs';

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
    assert.match(it.source, /^https:\/\/wahapedia\.ru\/aos4\//, it.name);
    assert.ok(it.in.length > 0, it.name);
  }
  // 116 текстов, обрезанных лимитом 1024 символа (172 записи), + 16 текстов с восстановленными таблицами (21 запись)
  assert.equal(ft.items.length, 132);
  assert.equal(ft.items.reduce((n: number, it: { in: string[] }) => n + it.in.length, 0), 193);
});

test('данные AoS: все 193 записи из fullTexts получили полный текст из curated', () => {
  let n = 0;
  for (const it of ft.items)
    for (const ref of it.in) {
      const recs = find(ref, it.name);
      assert.equal(recs.length, 1, `${ref} «${it.name}»: ожидалась ровно одна запись`);
      const r = recs[0]!;
      assert.equal(r.text, it.text, `${ref} «${it.name}»`);
      assert.equal(r.incomplete, undefined, `${ref} «${it.name}»`);
      assert.equal(r.textSource, 'wahapedia-site', `${ref} «${it.name}»`);
      n++;
    }
  assert.equal(n, 193);
});

// 4 конфликта (на сайте другая редакция) и 1 удержанное правило (текст на сайте сам выглядит оборванным):
// остаются с исходным текстом выгрузки и пометкой «неполный». Хэш — текст до восстановления (16.10.2026).
const HELD: [string, string, string][] = [
  ['OB|ws:Katakros, Mortarch of the Necropolis', 'Supreme Lord of the Bonereaper Legions', 'bb30160560c41909'],
  ['NT|ws:Lord Vitriolic', 'Spectral Alchemy', '754edcf4e7e36b9f'],
  ['CoS|ws:Linebreaker Cogfort', 'OUTPUT TO MAXIMUM!', 'c5b17d806b92f0a4'],
  ['SG|ws:Scourge of Aqshy Vengorian Lord', 'Frenzied Surge', '54a95ff1bd5a0ab8'],
  ['StD|form:Despoilers', 'FERAL RUIN', '83307c15f8521431'],
];

test('данные AoS: конфликты и удержанное правило не тронуты — исходный текст и пометка «неполный»', () => {
  assert.deepEqual(
    ft.missing.map((m: { in: string; name: string }) => `${m.in}|${m.name}`).sort(),
    HELD.map(([ref, name]) => `${ref}|${name}`).sort(),
  );
  const restored = new Set(ft.items.flatMap((it: { in: string[]; name: string }) => it.in.map((ref) => `${ref}|${it.name}`)));
  for (const [ref, name, hash] of HELD) {
    assert.ok(!restored.has(`${ref}|${name}`), `${ref} «${name}» не должен быть в fullTexts.items`);
    const recs = find(ref, name);
    assert.equal(recs.length, 1, `${ref} «${name}»`);
    assert.equal(recs[0]!.incomplete, 'truncated', `${ref} «${name}»`);
    assert.equal(recs[0]!.textSource, undefined, `${ref} «${name}»`);
    assert.equal(sha(recs[0]!.text), hash, `${ref} «${name}»: текст изменился`);
  }
});

test('данные AoS: отчёт подстановки без неподошедших текстов', () => {
  const lines = fullTextReport(Object.fromEntries(Object.entries(data).map(([id, d]) => [`${id}.json`, d])), curated);
  assert.ok(lines.some((l) => /подставлено 193\b/.test(l)), lines.join('\n'));
  assert.ok(!lines.some((l) => l.startsWith('полный текст из curated не подставлен')), lines.join('\n'));
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
  ['KO|ws:Scourge of Aqshy Endrinriggers', 'Emergency Field Repairs'],
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
    assert.equal(r.incomplete, undefined, `${ref} «${name}»`);
    assert.equal(r.textSource, 'wahapedia-site', `${ref} «${name}»`);
    assert.equal(r.text, items.get(`${ref}|${name}`), `${ref} «${name}»`);
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
