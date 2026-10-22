// Исправления перед первым обновлением данных (wh-rules 981): Upgrade-улучшения, защита сохранённых выборов
// снаряжения при изменённых вариантах, восстановление устаревших детачментов и улучшений (legacyKept).
// Данные не записываются: проверяется результат сухого прогона конвертера в памяти.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { availableDetachments, computeRoster, makeLookup } from '../../../client/src/features/roster/engine/compute';
import { legacyIds, migrateRoster } from '../../../client/src/features/roster/engine/migrate';
import { buildOptionRemap, remapPicks } from '../../../client/src/features/roster/engine/options-remap';
import { addUnit, decodeRoster, encodeRoster, newRoster, sanitizeRoster, updateUnit } from '../../../client/src/features/roster/engine/roster';
import { selectableEnhancement } from '../../../client/src/features/roster/engine/source';
import { applyPicks, optionsOf } from '../../../client/src/features/roster/engine/wargear';
import { LIMITS } from '../../../client/src/features/roster/engine/rules';
import type { Datasheet, FactionData, Roster } from '../../../client/src/features/roster/engine/types';
// @ts-expect-error — модуль .mjs без типов
import { baseline40k } from '../scripts/baseline-40k.mjs';
// @ts-expect-error — модуль .mjs без типов
import { dryRun, OPTIONS_NOTE } from '../scripts/whrules-convert.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(HERE, '../../../backend/roster-data');
// сухой прогон — на данных до обновления whrules-981 (история git); без них тесты пропускаются
const BASE = baseline40k();
const TB = BASE ? test : test.skip;
const R = BASE ? dryRun({ files: BASE.files }) : ({ _data: {}, enhancementEligibility: {}, _files: {} } as any);
const sm = R._data.sm as FactionData;
const aoi = R._data.aoi as FactionData;
const before = (f: string) => structuredClone(BASE!.files[f]) as FactionData;
const cur = (BASE ? before('SM.json') : { datasheets: [] }) as FactionData;
const L = makeLookup(sm);
const own = (F: FactionData) => F.datasheets.filter((d) => d.group === 'own');
const enh = (name: string) => sm.enhancements.find((e) => e.name === name && !e.outdated)!;
const holders = (name: string) => own(sm).filter((d) => d.enhancements.includes(enh(name).id));
const kw = (d: Datasheet) => new Set([...d.keywords, ...d.factionKeywords].map((k) => k.toUpperCase()));
const roster = (ds: Datasheet, detId: string, enhId: string | null = null): Roster => {
  let r: Roster = { ...addUnit(newRoster('SM'), ds), detachmentIds: [detId] };
  if (enhId) r = updateUnit(r, r.units[0]!.uid, { enhancementId: enhId });
  return r;
};
const errors = (r: Roster) => computeRoster(r, L).issues.filter((i) => i.level === 'error').map((i) => i.code);

// ---------- 1. Upgrade ----------
TB('Upgrade: шесть прежде недоступных улучшений связаны с юнитами по точному ограничению снимка', () => {
  const vehicles = holders('Redoubtable Machine Spirit');
  assert.equal(vehicles.length, 48);
  assert.deepEqual(holders('Gunnery Honours').map((d) => d.id), vehicles.map((d) => d.id));
  for (const d of vehicles) {
    const k = kw(d);
    assert.ok(k.has('ADEPTUS ASTARTES') && k.has('VEHICLE'), d.name);
    for (const x of ['DEDICATED TRANSPORT', 'FLY', 'WALKER']) assert.ok(!k.has(x), `${d.name}: исключено ${x}`);
  }
  // каждый подходящий по ключевым словам не персонаж — в списке (ничего не потеряно)
  const expectVeh = own(sm).filter((d) => !d.character && kw(d).has('ADEPTUS ASTARTES') && kw(d).has('VEHICLE') && !['DEDICATED TRANSPORT', 'FLY', 'WALKER'].some((x) => kw(d).has(x)));
  assert.deepEqual(vehicles.map((d) => d.id).sort(), expectVeh.map((d) => d.id).sort());
  const speeders = holders('Auspex Triangulation Shrines');
  assert.equal(speeders.length, 6);
  for (const d of speeders) assert.ok(kw(d).has('ADEPTUS ASTARTES') && kw(d).has('SPEEDER'), d.name);
  assert.deepEqual(holders('Fervent Exemplars').map((d) => d.name), ['Sword Brethren Squad']);
  assert.deepEqual(holders('Inheritors of Sigismund').map((d) => d.name), ['Sword Brethren Squad']);
  assert.deepEqual(holders('Righteous Fervour').map((d) => d.name), ['Crusader Squad']);
});

TB('Upgrade: в своём детачменте назначаются без ошибок; не больше LIMITS.upgradeTargets юнитов', () => {
  for (const name of ['Redoubtable Machine Spirit', 'Gunnery Honours', 'Auspex Triangulation Shrines', 'Fervent Exemplars', 'Inheritors of Sigismund', 'Righteous Fervour']) {
    const e = enh(name);
    assert.ok(e.upgrade, `${name}: upgrade`);
    const ds = holders(name)[0]!;
    const errs = errors(roster(ds, e.detachment, e.id)).filter((c) => c.startsWith('enh') || c.startsWith('upg'));
    assert.deepEqual(errs, [], `${name} → ${ds.name}`);
  }
  const e = enh('Gunnery Honours');
  const ds = holders('Gunnery Honours').find((d) => !d.epicHero)!;
  let r: Roster = { ...newRoster('SM', 'onslaught'), detachmentIds: [e.detachment] };
  for (let i = 0; i <= LIMITS.upgradeTargets; i++) r = addUnit(r, ds);
  for (const u of r.units) r = updateUnit(r, u.uid, { enhancementId: e.id });
  assert.ok(errors(r).includes('upg-count'), 'четвёртый юнит — ошибка');
});

TB('Upgrade: персонажи исключены — в данных не связаны, при назначении движок даёт ошибку upg-char', () => {
  for (const e of sm.enhancements.filter((x) => x.upgrade && !x.outdated))
    for (const d of own(sm).filter((x) => x.enhancements.includes(e.id))) assert.ok(!d.character, `${e.name}: ${d.name} — персонаж`);
  const vc = enh('Venerable Champion (Aura)');
  const bjorn = own(sm).find((d) => d.name === 'Bjorn the Fell-handed')!;
  assert.ok(bjorn.character && !bjorn.enhancements.includes(vc.id));
  assert.ok(errors(roster(bjorn, vc.detachment, vc.id)).includes('upg-char'));
});

TB('обычные «… unit only» не расширены', () => {
  for (const name of ['Castellum Omnivox', 'Spy-skull Data Link', 'Oathbound Exemplar']) {
    const e = sm.enhancements.find((x) => x.name === name && !x.outdated) ?? aoi.enhancements.find((x) => x.name === name && !x.outdated)!;
    assert.ok(!e.upgrade);
    for (const d of [...own(sm), ...own(aoi)].filter((x) => x.enhancements.includes(e.id))) assert.ok(d.character, `${name}: ${d.name}`);
  }
});

TB('Nightforged Battery: «LANDSPEEDER VENGEANCE» однозначно = Land Speeder Vengeance (000000242), только он', () => {
  const nb = enh('Nightforged Battery');
  assert.ok(nb.upgrade);
  assert.equal(nb.restriction, 'LANDSPEEDER VENGEANCE unit only.');
  assert.deepEqual(sm.datasheets.filter((d) => d.enhancements.includes(nb.id)).map((d) => `${d.id} ${d.name} ${d.group}`), ['000000242 Land Speeder Vengeance own']);
  const row = R.enhancementEligibility.sm.explicit.find((x: { name: string }) => x.name === 'Nightforged Battery');
  assert.deepEqual(row.spelling, { from: 'LANDSPEEDER VENGEANCE', to: 'LAND SPEEDER VENGEANCE' });
  // правило написания применяется только здесь: у остальных улучшений и стратагем его нет
  assert.deepEqual(R.enhancementEligibility.sm.explicit.filter((x: { spelling?: unknown }) => x.spelling).map((x: { name: string }) => x.name), ['Nightforged Battery']);
  assert.deepEqual(R.enhancementEligibility.sm.unmatched, []);
  const ds = sm.datasheets.find((d) => d.id === '000000242')!;
  assert.deepEqual(errors(roster(ds, nb.detachment, nb.id)).filter((c) => c.startsWith('enh') || c.startsWith('upg')), []);
  // @ts-expect-error — модуль .mjs без типов
  return import('../scripts/whrules-convert.mjs').then(({ keywordReq }) => {
    const vocab = R._data.vocab.sm as Set<string>;
    assert.equal(keywordReq('LANDSPEEDER VENGEANCE SQUADRON unit only.', vocab), null, 'только вся фраза целиком');
    assert.equal(keywordReq('ADEPTUS ASTARTES LANDSPEEDER VENGEANCE unit only.', vocab), null, 'часть фразы — не угадывается');
    assert.equal(keywordReq('LANDSPEEDER VENGEANCE/LAND RAIDER unit only.', vocab), null, 'альтернативы не угадываются');
  });
});

// ---------- 2. выборы снаряжения ----------
const intercessorOld = cur.datasheets.find((d) => d.name === 'Intercessor Squad' && d.group === 'own')!;
const withOptions = (ds: Datasheet, texts: string[]): Datasheet => ({ ...structuredClone(ds), options: texts.map((text) => ({ star: false, text })) });
const T = intercessorOld.options.map((o) => o.text);
const remapOf = (texts: string[]) => buildOptionRemap(intercessorOld, withOptions(intercessorOld, texts), 'n')!;
const choiceIdx = (ds: Datasheet, key: string, weapon: string) => optionsOf(ds).parsed.find((o) => o.key === key)!.choices.findIndex((c) => c.some((i) => i.weapon.toLowerCase() === weapon.toLowerCase()));

TB('варианты: Intercessor Squad (тот же id) — прежний выбор не превращается в другое оружие', () => {
  const remap = sm.migrations!.options![intercessorOld.id]!;
  assert.ok(remap, 'изменение вариантов обнаружено');
  const L0 = (picks: Record<string, number[]>) => {
    let r: Roster = addUnit(newRoster('SM'), intercessorOld);
    r = updateUnit(r, r.units[0]!.uid, { picks });
    const m = migrateRoster(r, L);
    return { r, u: m.roster.units[0]!, cr: computeRoster(m.roster, L) };
  };
  // случай из проверки: «Astartes chainsword» вместо болт-винтовки (фраза 0, вариант 0). Раньше по номеру выходил
  // Chainsword вместо Knives and Fists (новая фраза 0). Теперь такой замены болт-винтовки нет по смыслу — откладывается.
  const ch = L0({ '0': [1] });
  assert.equal(ch.u.picks, null, 'выбор отложен');
  assert.equal(ch.u.migration?.reason, 'options');
  assert.deepEqual(ch.u.migration?.dropped.picks, { '0': [1] });
  assert.ok(!('Chainsword' in ch.cr.units[0]!.loadout), JSON.stringify(ch.cr.units[0]!.loadout));
  const msg = ch.cr.issues.find((i) => i.code === 'migrated')!;
  assert.ok(msg.message.includes(OPTIONS_NOTE) && msg.message.includes('проверьте'), msg.message);
  // Hand flamer вместо болт-винтовки — тот же смысл в новой фразе 1: переносится, без сообщения
  const hf = choiceIdx(intercessorOld, '0', 'hand flamer');
  const fl = L0({ '0': Array.from({ length: hf + 1 }, (_, i) => (i === hf ? 1 : 0)) });
  assert.equal(fl.u.migration, undefined);
  assert.equal(fl.u.picks!['1']![choiceIdx(sm.datasheets.find((d) => d.id === intercessorOld.id)!, '1', 'hand flamer')], 1);
  assert.equal(fl.cr.units[0]!.loadout['Hand Flamer'], 1);
  assert.ok(!('Chainsword' in fl.cr.units[0]!.loadout));
});

TB('варианты: переставлены — выбор переносится по смыслу; удалён / заменён / оружие переименовано — откладывается', () => {
  const hf = choiceIdx(intercessorOld, '0', 'hand flamer');
  const pick = (n: number) => Array.from({ length: n + 1 }, (_, i) => (i === n ? 1 : 0));
  // переставлены
  const re = remapOf([T[2]!, T[0]!, T[1]!]);
  const a = remapPicks({ '0': pick(hf) }, re);
  assert.deepEqual(Object.keys(a.picks), ['1']);
  assert.equal(a.picks['1']![hf], 1);
  assert.deepEqual(a.dropped, {});
  // перефразировано без изменения смысла (переименована фраза, не оружие)
  const reworded = remapOf([T[0]!.replace('The Intercessor Sergeant’s bolt rifle can be replaced with', 'The Intercessor Sergeant can have their bolt rifle replaced with'), T[1]!, T[2]!]);
  assert.deepEqual(remapPicks({ '0': pick(hf) }, reworded).dropped, {}, 'смысл тот же — сохраняется');
  // удалён
  const removed = remapOf([T[1]!, T[2]!]);
  assert.deepEqual(remapPicks({ '0': pick(hf) }, removed), { picks: {}, dropped: { '0': pick(hf) } });
  // заменён (другое снимаемое оружие)
  const replaced = remapOf([T[0]!.replace('bolt rifle', 'bolt pistol'), T[1]!, T[2]!]);
  assert.deepEqual(remapPicks({ '0': pick(hf) }, replaced).dropped, { '0': pick(hf) });
  // оружие варианта переименовано: этот выбор откладывается, другие варианты той же фразы — сохраняются
  const renamed = remapOf([T[0]!.replace('hand flamer', 'hand incinerator'), T[1]!, T[2]!]);
  assert.deepEqual(remapPicks({ '0': pick(hf) }, renamed).dropped, { '0': pick(hf) });
  const pp = choiceIdx(intercessorOld, '0', 'plasma pistol');
  assert.deepEqual(remapPicks({ '0': pick(pp) }, renamed).dropped, {});
  // неоднозначно: две одинаковые по смыслу фразы — не угадываем
  const dup = remapOf([T[0]!, T[0]!, T[1]!, T[2]!]);
  assert.equal(dup.keys['0'], null);
  // варианты не изменились — таблицы нет
  assert.equal(buildOptionRemap(intercessorOld, structuredClone(intercessorOld), 'n'), null);
});

TB('варианты: перевод применяется один раз — сохранение, повторное открытие и код ростера не сбрасывают выборы', () => {
  const neu = sm.datasheets.find((d) => d.id === intercessorOld.id)!;
  let r: Roster = addUnit(newRoster('SM'), intercessorOld);
  r = updateUnit(r, r.units[0]!.uid, { picks: { '0': [1] } });
  const first = migrateRoster(r, L);
  assert.ok(first.changed);
  assert.deepEqual(first.roster.appliedMigrations, [sm.migrations!.source]);
  // игрок выбирает заново по новым вариантам, сохраняет (localStorage → sanitizeRoster) и открывает снова
  const repick = updateUnit({ ...first.roster, units: first.roster.units.map((u) => ({ ...u, migration: null })) }, first.roster.units[0]!.uid, { picks: { '0': [0, 1] } });
  const saved = sanitizeRoster(JSON.parse(JSON.stringify(repick)))!;
  assert.deepEqual(saved.appliedMigrations, [sm.migrations!.source]);
  const again = migrateRoster(saved, L);
  assert.equal(again.changed, false, 'повторно не применяется');
  assert.deepEqual(again.roster.units[0]!.picks, { '0': [0, 1] });
  assert.ok(applyPicks(neu, {}, again.roster.units[0]!.picks!, 5));
  // код ростера: отметка переносится
  const code = decodeRoster(encodeRoster(saved));
  assert.equal(migrateRoster(code, L).changed, false);
  // новый ростер: при первом открытии получает отметку, выборы по новым вариантам потом не трогаются
  const fresh = migrateRoster(newRoster('SM'), L).roster;
  let w = addUnit(fresh, neu);
  w = updateUnit(w, w.units[0]!.uid, { picks: { '0': [1] } });
  assert.equal(migrateRoster(w, L).changed, false);
  assert.deepEqual(migrateRoster(w, L).roster.units[0]!.picks, { '0': [1] });
});

TB('варианты: таблицы есть для всех записей с тем же id и изменёнными вариантами (SM, AoI, копии в 7 фракциях)', () => {
  const changedSame = (F: FactionData, before: FactionData) => {
    const O = new Map(before.datasheets.map((d) => [d.id, d]));
    return F.datasheets.filter((d) => O.has(d.id) && JSON.stringify(O.get(d.id)!.options.map((o) => o.text)) !== JSON.stringify(d.options.map((o) => o.text))).map((d) => d.id).sort();
  };
  const curAoi = before('AoI.json');
  assert.deepEqual(Object.keys(sm.migrations!.options!).sort(), [...new Set(changedSame(sm, cur))].sort());
  assert.deepEqual(Object.keys(aoi.migrations!.options!).sort(), changedSame(aoi, curAoi));
  for (const f of R._files.copyFiles as string[]) {
    const prev = before(`${f}.json`);
    const after = R._files.files[`${f}.json`] as FactionData;
    assert.deepEqual(Object.keys(after.migrations?.options ?? {}).sort(), changedSame(after, prev), f);
  }
  assert.ok(R.checks.every((c: { ok: boolean }) => c.ok));
});

// ---------- 3. восстановление устаревших ----------
TB('legacyKept: устаревший детачмент и улучшение — открыть, изменить, удалить, сохранить, открыть, вернуть', () => {
  const det = sm.detachments.find((d) => d.outdated && sm.enhancements.some((e) => e.detachment === d.id && cur.datasheets.some((x) => x.group === 'own' && !x.epicHero && x.enhancements.includes(e.id))))!;
  const e = sm.enhancements.find((x) => x.detachment === det.id && cur.datasheets.some((d) => d.group === 'own' && !d.epicHero && d.enhancements.includes(x.id)))!;
  const ds = sm.datasheets.find((d) => d.id === cur.datasheets.find((x) => x.group === 'own' && !x.epicHero && x.enhancements.includes(e.id))!.id)!;
  // старый ростер (до обновления): детачмент и улучшение уже выбраны
  const old = roster(ds, det.id, e.id);
  const points = computeRoster(old, L).points;
  // открыть
  const opened = migrateRoster(old, L).roster;
  assert.deepEqual(opened.legacyKept, { detachments: [det.id], enhancements: [e.id] });
  assert.equal(computeRoster(opened, L).points, points, 'очки не изменились');
  assert.deepEqual(opened.units[0]!.picks, old.units[0]!.picks);
  assert.equal(opened.units[0]!.size, old.units[0]!.size);
  // изменить: другое улучшение → прежнее снова доступно в выборе (запомнено)
  const removedEnh = updateUnit(opened, opened.units[0]!.uid, { enhancementId: null });
  assert.ok(selectableEnhancement(e, null, removedEnh.legacyKept?.enhancements));
  // удалить детачмент, сохранить, открыть заново
  const removed = sanitizeRoster(JSON.parse(JSON.stringify({ ...removedEnh, detachmentIds: [] })))!;
  const reopened = migrateRoster(removed, L).roster;
  assert.deepEqual(reopened.legacyKept, { detachments: [det.id], enhancements: [e.id] });
  assert.ok(availableDetachments(L, null, legacyIds(reopened).detachments).some((d) => d.id === det.id), 'детачмент можно вернуть');
  // вернуть детачмент и улучшение — очки как прежде, ошибок по улучшению нет
  const restored = updateUnit({ ...reopened, detachmentIds: [det.id] }, reopened.units[0]!.uid, { enhancementId: e.id });
  assert.equal(computeRoster(restored, L).points, points);
  assert.deepEqual(errors(restored).filter((c) => c.startsWith('enh') || c.startsWith('det')), []);
  // через код ростера — то же
  const viaCode = decodeRoster(encodeRoster({ ...removedEnh, detachmentIds: [] }));
  assert.deepEqual(viaCode.legacyKept, { detachments: [det.id], enhancements: [e.id] });
  // новый ростер: устаревшее не предлагается
  const fresh = migrateRoster(newRoster('SM'), L).roster;
  assert.equal(fresh.legacyKept, undefined);
  assert.ok(!availableDetachments(L, null, legacyIds(fresh).detachments).some((d) => d.id === det.id));
  assert.ok(!selectableEnhancement(e, null, fresh.legacyKept?.enhancements));
});

TB('legacyKept: старый код ростера (без списка) — устаревшее запоминается при первом открытии', () => {
  const det = sm.detachments.find((d) => d.outdated)!;
  const code = encodeRoster({ ...newRoster('SM'), detachmentIds: [det.id] });
  const opened = migrateRoster(decodeRoster(code), L).roster;
  assert.deepEqual(opened.legacyKept?.detachments, [det.id]);
});

// ---------- отметка времени ----------
TB('автоматический перевод не меняет «последнее изменение» ростера (updatedAt)', () => {
  let r: Roster = addUnit(newRoster('SM'), intercessorOld);
  r = updateUnit(r, r.units[0]!.uid, { picks: { '0': [1] } });
  const det = sm.detachments.find((d) => d.outdated)!;
  r = { ...r, detachmentIds: [det.id], updatedAt: 1_700_000_000_000 };
  const m = migrateRoster(r, L);
  assert.ok(m.changed && m.roster.appliedMigrations?.length && m.roster.legacyKept?.detachments.length && m.roster.units[0]!.migration);
  assert.equal(m.roster.updatedAt, 1_700_000_000_000);
  // правка игроком — обычная: время обновляется
  assert.ok(updateUnit(m.roster, m.roster.units[0]!.uid, { migration: null }).updatedAt > 1_700_000_000_000);
});

// ---------- границы: 7 фракций с копиями Imperial Agents ----------
TB('границы: в AC, AM, AS, AdM, GK, QI, TL — только копии Imperial Agents, их правило и таблицы вариантов', async () => {
  // @ts-expect-error — модуль .mjs без типов
  const { scopeCheck } = await import('../scripts/whrules-convert.mjs');
  const load = before;
  const others = Object.keys(BASE!.files).filter((f) => f.endsWith('.json') && f !== 'SM.json' && f !== 'AoI.json').sort().map(load);
  const current = { SM: cur, AoI: load('AoI.json'), others };
  const base = R._files;
  const ok = scopeCheck(current, base, { aoi });
  assert.deepEqual(ok.violations, []);
  const tamper = (fn: (files: Record<string, FactionData>) => void) => {
    const files = structuredClone(base.files) as Record<string, FactionData>;
    fn(files);
    return scopeCheck(current, { ...base, files }, { aoi }).violations.map((v: { file: string }) => v.file);
  };
  // очки не-копии
  assert.deepEqual(tamper((f) => { const d = f['AM.json']!.datasheets.find((x) => x.group === 'own')!; d.costs[0]!.options[0]!.cost += 5; }), ['AM.json']);
  // снаряжение копии отличается от оригинала
  assert.deepEqual(tamper((f) => { const d = f['GK.json']!.datasheets.find((x) => x.group === 'ally:agents')!; d.loadout += ' x'; }), ['GK.json']);
  // изменено существующее правило
  assert.deepEqual(tamper((f) => { const k = Object.keys(f['TL.json']!.rules)[0]!; f['TL.json']!.rules[k]!.text += ' x'; }), ['TL.json']);
  // лишняя таблица вариантов / таблица не как у оригинала / замена id
  assert.deepEqual(tamper((f) => { const own0 = f['QI.json']!.datasheets.find((x) => x.group === 'own')!; f['QI.json']!.migrations!.options![own0.id] = { note: '', keys: {} }; }), ['QI.json']);
  assert.deepEqual(tamper((f) => { const id = Object.keys(f['AC.json']!.migrations!.options!)[0]!; f['AC.json']!.migrations!.options![id]!.note = 'x'; }), ['AC.json']);
  assert.deepEqual(tamper((f) => { f['AS.json']!.migrations!.datasheets['x'] = { to: 'y', reason: 'replaced', note: '' }; }), ['AS.json']);
  // детачменты или стратагемы фракции
  assert.deepEqual(tamper((f) => { f['AdM.json']!.detachments[0]!.dp += 1; }), ['AdM.json']);
});
