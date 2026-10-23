// SM-3: стратегия id, перевод сохранённых ростеров (engine/migrate.ts), Force Disposition из нескольких значений,
// пометка «*» для инфолистов без покрытия источником (engine/source.ts), план замен Space Marines (whrules-map.mjs).
// Данные приложения не меняются: проверки идут на копиях в памяти. Запуск: bun test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { computeRoster, makeLookup } from '../../../client/src/features/roster/engine/compute';
import { droppedSummary, migrateRoster, resolveId } from '../../../client/src/features/roster/engine/migrate';
import { addUnit, decodeRoster, encodeRoster, newRoster, sanitizeRoster, updateUnit } from '../../../client/src/features/roster/engine/roster';
import { dispositionsOf, dsLabel, isOutdated, OUTDATED_NOTE, outdatedNote } from '../../../client/src/features/roster/engine/source';
import type { Datasheet, DataMigrations, Detachment, FactionData, IdMigration } from '../../../client/src/features/roster/engine/types';
// @ts-expect-error — .mjs без типов
import { loadFull, loadRenames, mapSpaceMarines, newId, planSpaceMarines } from '../scripts/whrules-map.mjs';
// @ts-expect-error — .mjs без типов
import { loadSnapshot } from '../scripts/updates-40k.mjs';
// @ts-expect-error — модуль .mjs без типов
import { baseline40k } from '../scripts/baseline-40k.mjs';

const DATA = path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data');
// данные до обновления whrules-981 (история git): перевод ростеров проверяется с данных импорта Wahapedia
const BASE = baseline40k();
const TB = BASE ? test : test.skip;
const load = (f: string): FactionData => structuredClone(BASE?.files[f] ?? JSON.parse(fs.readFileSync(path.join(DATA, 'f', f), 'utf8'))) as FactionData;
const SM = load('SM.json');
const byName = (n: string) => SM.datasheets.find((d) => d.name === n && d.group === 'own')!;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** Фракция-копия с заменами: старый инфолист убран из данных, вместо него — новый (как после обновления). */
function migratedFaction(oldDs: Datasheet, newDs: Datasheet, m: Omit<IdMigration, 'to'>, extra: Partial<DataMigrations> = {}): FactionData {
  return {
    ...SM,
    datasheets: [...SM.datasheets.filter((d) => d.id !== oldDs.id), newDs],
    migrations: { source: 'test', datasheets: { [oldDs.id]: { ...m, to: newDs.id } }, detachments: {}, enhancements: {}, ...extra },
  };
}

TB('resolveId: прямая замена, цепочка, цикл, цель без данных, уже существующий id', () => {
  const t: Record<string, IdMigration> = {
    a: { to: 'b', reason: 'renamed', note: 'a→b', keepPicks: true },
    b: { to: 'c', reason: 'merged', note: 'b→c', keepPicks: false },
    x: { to: 'y', reason: 'renamed', note: '' },
    y: { to: 'x', reason: 'renamed', note: '' },
    q: { to: 'nowhere', reason: 'replaced', note: '' },
  };
  const has = (id: string) => ['c', 'keep'].includes(id);
  assert.deepEqual(resolveId('a', t, has), { to: 'c', reason: 'renamed', note: 'a→b', keepPicks: false });
  assert.equal(resolveId('x', t, has), null, 'цикл не зацикливается');
  assert.equal(resolveId('q', t, has), null, 'цели нет в данных — не переводим');
  assert.equal(resolveId('keep', t, has), null, 'существующий id не трогаем');
  assert.equal(resolveId('a', undefined, has), null);
});

TB('перевод юнита: размер и платное снаряжение сохраняются, если совместимы; несовместимое откладывается, не удаляется', () => {
  const oldDs = byName('Terminator Squad');
  const newDs: Datasheet = { ...clone(oldDs), id: 'whr:space-marines:terminator-squad' };
  newDs.costs[0]!.wargear = [{ label: 'Cyclone missile launcher', cost: 10 }];
  const F = migratedFaction(oldDs, newDs, { reason: 'shared', note: 'общий инфолист' });
  const L = makeLookup(F);
  let r = addUnit(newRoster('SM'), oldDs);
  const u = r.units[0]!;
  r = updateUnit(r, u.uid, { size: oldDs.costs[0]!.options.at(-1)!.label, wargear: { 'Cyclone missile launcher': 1, 'Old item': 2 }, picks: { '0': [1] } });
  const { roster, changed } = migrateRoster(r, L);
  assert.ok(changed);
  const mu = roster.units[0]!;
  assert.equal(mu.datasheetId, newDs.id);
  assert.equal(mu.uid, u.uid, 'uid и присоединения сохраняются');
  assert.equal(mu.size, oldDs.costs[0]!.options.at(-1)!.label, 'совместимый размер сохранён');
  assert.deepEqual(mu.wargear, { 'Cyclone missile launcher': 1 });
  assert.deepEqual(mu.picks, null, 'без keepPicks замены не применяются к новому инфолисту…');
  assert.deepEqual(mu.migration?.dropped, { wargear: { 'Old item': 2 }, picks: { '0': [1] } }, '…а откладываются как были');
  assert.equal(mu.migration?.from, oldDs.id);
  // предупреждение в проверке ростера, без ошибки «инфолист не найден»
  const cr = computeRoster(roster, L);
  assert.ok(!cr.issues.some((i) => i.code === 'missing'));
  const w = cr.issues.find((i) => i.code === 'migrated');
  assert.ok(w && w.level === 'warning' && w.unitUids?.[0] === u.uid);
  assert.match(w.message, /Old item ×2/);
  assert.match(w.message, /выбранные замены снаряжения/);
  // повторный запуск ничего не меняет
  assert.equal(migrateRoster(roster, L).changed, false);
  // сведения о замене переживают сохранение и код ростера
  const back = decodeRoster(encodeRoster(roster), ['SM']);
  assert.deepEqual(back.units[0]!.migration, mu.migration);
  assert.deepEqual(sanitizeRoster(clone(roster))!.units[0]!.migration, mu.migration);
  // игрок скрыл сообщение — предупреждения нет
  const cleared = updateUnit(roster, u.uid, { migration: null });
  assert.ok(!computeRoster(cleared, L).issues.some((i) => i.code === 'migrated'));
  assert.equal(sanitizeRoster(clone(cleared))!.units[0]!.migration, undefined);
});

TB('перевод юнита: keepPicks сохраняет выбранные замены; несовместимый размер откладывается', () => {
  const oldDs = byName('Intercessor Squad');
  const newDs: Datasheet = { ...clone(oldDs), id: 'whr:test:intercessors' };
  newDs.costs[0]!.options = [{ label: '6 models', models: 6, cost: 100 }];
  const L = makeLookup(migratedFaction(oldDs, newDs, { reason: 'renamed', note: 'r', keepPicks: true }));
  let r = addUnit(newRoster('SM'), oldDs);
  r = updateUnit(r, r.units[0]!.uid, { size: oldDs.costs[0]!.options[0]!.label, picks: { '0': [1] } });
  const mu = migrateRoster(r, L).roster.units[0]!;
  assert.deepEqual(mu.picks, { '0': [1] });
  assert.equal(mu.size, '6 models');
  assert.deepEqual(mu.migration?.dropped, { size: oldDs.costs[0]!.options[0]!.label });
  assert.deepEqual(droppedSummary(mu.migration!.dropped), [`размер «${oldDs.costs[0]!.options[0]!.label}»`]);
});

TB('детачменты и улучшения: замена по таблице с сообщением; без замены — ошибка, а не тихое удаление', () => {
  const det = SM.detachments[0]!;
  const enh = SM.enhancements.find((e) => e.detachment === det.id)!;
  const F: FactionData = {
    ...SM,
    detachments: [...SM.detachments.filter((d) => d.id !== det.id), { ...det, id: 'whr:space-marines:det:new' }],
    enhancements: [...SM.enhancements.filter((e) => e.id !== enh.id), { ...enh, id: 'whr:e', detachment: 'whr:space-marines:det:new' }],
    migrations: {
      source: 'test',
      datasheets: {},
      detachments: { [det.id]: { to: 'whr:space-marines:det:new', reason: 'replaced', note: 'новая версия детачмента' } },
      enhancements: { [enh.id]: { to: 'whr:e', reason: 'replaced', note: 'новая версия улучшения' } },
    },
  };
  const L = makeLookup(F);
  const cap = SM.datasheets.find((d) => d.name === 'Captain' && d.group === 'own')!;
  let r = { ...addUnit(newRoster('SM'), cap), detachmentIds: [det.id] };
  r = updateUnit(r, r.units[0]!.uid, { enhancementId: enh.id });
  const m = migrateRoster(r, L);
  assert.deepEqual(m.roster.detachmentIds, ['whr:space-marines:det:new']);
  assert.equal(m.roster.units[0]!.enhancementId, 'whr:e');
  assert.deepEqual(m.roster.migrationNotes?.map((n) => n.kind), ['enhancement', 'detachment']);
  const cr = computeRoster(m.roster, L);
  assert.ok(cr.issues.some((i) => i.code === 'migrated-detachment' && i.level === 'warning'));
  assert.equal(migrateRoster(m.roster, L).changed, false);
  assert.deepEqual(sanitizeRoster(clone(m.roster))!.migrationNotes, m.roster.migrationNotes);
  // без таблицы: удалённый детачмент и улучшение — ошибки
  const bare = { ...SM, detachments: F.detachments, enhancements: F.enhancements };
  const cr2 = computeRoster(r, makeLookup(bare));
  assert.ok(cr2.issues.some((i) => i.code === 'det-missing' && i.level === 'error'));
  assert.ok(cr2.issues.some((i) => i.code === 'enh-missing' && i.level === 'error'));
  assert.equal(migrateRoster(r, makeLookup(bare)).changed, false);
});

TB('Force Disposition: детачмент может давать несколько; старые данные — одно значение', () => {
  const d0 = SM.detachments.find((d) => d.forceDisposition)!;
  assert.deepEqual(dispositionsOf(d0), [d0.forceDisposition]);
  assert.deepEqual(dispositionsOf({ forceDisposition: null }), []);
  const multi: Detachment = { ...d0, forceDisposition: 'Reconnaissance', forceDispositions: ['Reconnaissance', 'Take and Hold'] };
  const L = makeLookup({ ...SM, detachments: [...SM.detachments.filter((d) => d.id !== d0.id), multi] });
  const r = { ...newRoster('SM'), detachmentIds: [multi.id], forceDisposition: 'Take and Hold' };
  const cr = computeRoster(r, L);
  assert.deepEqual(cr.dispositions, ['Reconnaissance', 'Take and Hold']);
  assert.ok(!cr.issues.some((i) => i.code === 'fd' || i.code === 'fd-missing'));
  assert.ok(computeRoster({ ...r, forceDisposition: 'Disruption' }, L).issues.some((i) => i.code === 'fd'));
});

TB('пометка «*»: только у инфолистов с outdated; пояснение показывается со звёздочкой', () => {
  const ds = byName('Tactical Squad');
  assert.equal(isOutdated(ds), false);
  assert.equal(dsLabel(ds), 'Tactical Squad');
  assert.equal(outdatedNote(ds), null);
  const marked = { ...ds, outdated: OUTDATED_NOTE };
  assert.equal(dsLabel(marked), 'Tactical Squad*');
  assert.equal(outdatedNote(marked), OUTDATED_NOTE);
  assert.equal(outdatedNote({ outdated: 'нет в источнике' }), '* нет в источнике');
  // помеченный инфолист остаётся доступным: добавляется и считается как обычно
  const L = makeLookup({ ...SM, datasheets: SM.datasheets.map((d) => (d.id === ds.id ? marked : d)) });
  const cr = computeRoster(addUnit(newRoster('SM'), marked), L);
  assert.ok(cr.units[0]!.total > 0);
  assert.ok(!cr.issues.some((i) => i.code === 'missing'));
});

TB('план Space Marines (wh-rules 981): id, замены Sicaran и Black Templars, Cassius отдельно, пометки по покрытию', () => {
  const others = Object.keys(BASE!.files).filter((f) => f.endsWith('.json') && f !== 'SM.json' && f !== 'AoI.json').sort().map(load);
  const MAP = mapSpaceMarines(loadSnapshot('whrules-981.json'), loadRenames('whrules-981-renames.json'), SM, load('AoI.json'), others);
  const P = planSpaceMarines(MAP, loadFull('whrules-981-full.json'), SM);
  assert.equal(P.keep, 220, 'сопоставленные и переименованные сохраняют id');
  assert.deepEqual(P.newIds, [newId('space-marines', 'kaius-konorius'), newId('space-marines', 'sicaran')]);
  const t = P.migrations.datasheets as Record<string, IdMigration>;
  for (const id of ['000000092', '000000123', '000001161', '000001163', '000001185']) assert.deepEqual([t[id]!.to, t[id]!.reason], ['whr:space-marines:sicaran', 'merged'], id);
  const sharedTo = (n: string) => SM.datasheets.find((d) => d.name === n && d.group === 'own' && !d.factionKeywords.includes('Black Templars') && d.factionKeywords.length === 1)!.id;
  assert.deepEqual([t['000004137']!.to, t['000004137']!.reason], [sharedTo('Sternguard Veteran Squad'), 'shared']);
  assert.deepEqual([t['000004138']!.to, t['000004138']!.reason], [sharedTo('Terminator Squad'), 'shared']);
  assert.deepEqual([t['000004139']!.to, t['000004139']!.reason], [sharedTo('Land Raider Crusader'), 'shared']);
  assert.equal(Object.keys(t).length, 8);
  assert.ok(Object.values(t).every((m) => m.keepPicks === false), 'варианты снаряжения подтверждает конвертер (SM-4)');
  assert.ok(!t['000003875'] && P.outdated.some((o: { id: string }) => o.id === '000003875'), 'Kill Team Cassius 3875 остаётся отдельно');
  // пометки: ровно инфолисты без покрытия источником и без замены; сопоставленные не помечаются
  const covered = new Set([...MAP.matched, ...MAP.renamed].map((x: { ours: { id: string } }) => x.ours.id));
  assert.equal(P.outdated.length, MAP.removed.length + MAP.unmatched.length - Object.keys(t).length);
  assert.ok(P.outdated.every((o: { id: string }) => !covered.has(o.id) && !t[o.id]));
  assert.ok(!P.outdated.some((o: { id: string }) => ['000000139', '000002700'].includes(o.id)), 'Forge World Thunderhawk и Astraeus есть в источнике — не помечаются');
  assert.match(P.outdatedNote, /^\* .*wh-rules\.ru \(версия 981\)/);
  // таблица замен работает в движке: сохранённый ростер с Sicaran Venator переводится на новый инфолист
  const venator = SM.datasheets.find((d) => d.id === '000000092')!;
  const sicaran: Datasheet = { ...clone(venator), id: 'whr:space-marines:sicaran', name: 'Sicaran' };
  const F: FactionData = { ...SM, datasheets: [...SM.datasheets.filter((d) => !t[d.id]), sicaran], migrations: P.migrations };
  const r = addUnit(newRoster('SM'), venator);
  const m = migrateRoster(r, makeLookup(F));
  assert.equal(m.roster.units[0]!.datasheetId, 'whr:space-marines:sicaran');
  assert.equal(m.roster.units[0]!.migration?.reason, 'merged');
});

TB('подпись ссылки на источник: wh-rules.ru для новых данных, Wahapedia для прежних', async () => {
  const { linkLabel } = await import('../../../client/src/features/roster/engine/source');
  assert.equal(linkLabel('https://wh-rules.ru/ru/factions/space-marines/datasheets'), 'wh-rules.ru');
  assert.equal(linkLabel('https://wahapedia.ru/wh40k11ed/factions/space-marines/Tactical-Squad'), 'Wahapedia');
});

// ---------- P1-T4d: несколько обновлений файла, смена размера отряда у того же инфолиста ----------
const AC_NOW = (): FactionData => JSON.parse(fs.readFileSync(path.join(DATA, 'f', 'AC.json'), 'utf8'));

test('migrations списком: каждое обновление применяется по порядку, переводы вариантов — один раз по своему source', () => {
  const F = AC_NOW();
  assert.ok(Array.isArray(F.migrations) && F.migrations.length === 2);
  const [m981, m995] = F.migrations as DataMigrations[];
  const L = makeLookup(F);
  // юнит Custodes с выбранными заменами, у которого варианты изменились в 995
  const id = Object.keys(m995.options ?? {}).find((x) => L.ds.has(x) && Object.keys(m995.options![x]!.keys).length)!;
  let r = addUnit(newRoster('AC'), L.ds.get(id)!);
  const key = Object.keys(m995.options![id]!.keys)[0]!;
  r = updateUnit(r, r.units[0]!.uid, { picks: { [key]: [1] } });
  // ростер уже прошёл 981: его переводы не повторяются, 995 — применяется
  r = { ...r, appliedMigrations: [m981.source] };
  const a = migrateRoster(r, L);
  assert.ok(a.changed);
  assert.deepEqual(a.roster.appliedMigrations, [m981.source, m995.source]);
  // повторное открытие ничего не меняет
  assert.equal(migrateRoster(a.roster, L).changed, false);
  // прежняя запись одним объектом по-прежнему работает
  const single = { ...F, migrations: m995 };
  assert.deepEqual(migrateRoster({ ...r, appliedMigrations: [] }, makeLookup(single)).roster.appliedMigrations, [m995.source]);
});

test('тот же инфолист, сохранённого размера нет (Custodian Wardens 4 → 2/3 модели): размер отложен, предупреждение, повтор — без изменений', () => {
  const F = AC_NOW();
  const L = makeLookup(F);
  const wardens = F.datasheets.find((d) => d.name === 'Custodian Wardens' && d.group === 'own')!;
  let r = addUnit(newRoster('AC'), wardens);
  r = { ...r, units: [{ ...r.units[0]!, size: '4 models' }], appliedMigrations: (F.migrations as DataMigrations[]).map((m) => m.source) };
  const a = migrateRoster(r, L);
  assert.ok(a.changed);
  const u = a.roster.units[0]!;
  assert.equal(u.size, '2 models');
  assert.equal(u.migration?.reason, 'size');
  assert.equal(u.migration?.dropped.size, '4 models');
  assert.deepEqual(droppedSummary(u.migration!.dropped), ['размер «4 models»']);
  const c = computeRoster(a.roster, L);
  assert.ok(c.issues.some((i) => i.code === 'migrated' && /Размер отряда изменился/.test(i.message) && /4 models/.test(i.message)));
  assert.ok(!c.issues.some((i) => i.code === 'size'), 'размер выбран — ошибки «выберите размер» нет');
  assert.equal(migrateRoster(a.roster, L).changed, false);
});
