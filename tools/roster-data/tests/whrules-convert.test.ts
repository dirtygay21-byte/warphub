// SM-4: конвертер снимка wh-rules 981 → формат приложения (сухой прогон). Данные приложения не меняются.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { availableDetachments, computeRoster, makeLookup } from '../../../client/src/features/roster/engine/compute';
import { migrateRoster } from '../../../client/src/features/roster/engine/migrate';
import { addUnit, newRoster, updateUnit } from '../../../client/src/features/roster/engine/roster';
import { factionCredit, indexCredit, selectableDetachments, selectableEnhancement, sourceLabel, visibleStratagem } from '../../../client/src/features/roster/engine/source';
import { optionsOf } from '../../../client/src/features/roster/engine/wargear';
import type { Datasheet, FactionData } from '../../../client/src/features/roster/engine/types';
// @ts-expect-error — модуль .mjs без типов
import { baseline40k } from '../scripts/baseline-40k.mjs';
// @ts-expect-error — .mjs без типов
import { armyRulesOf, coreParts, costsOf, dryRun, keywordReq, mdToText, tierOf, weaponsOf } from '../scripts/whrules-convert.mjs';
// @ts-expect-error — .mjs без типов
import { loadFull } from '../scripts/whrules-map.mjs';

const DATA = path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data');
const hashData = () => {
  const h = crypto.createHash('sha256');
  for (const f of fs.readdirSync(path.join(DATA, 'f')).sort()) h.update(f).update(fs.readFileSync(path.join(DATA, 'f', f)));
  h.update(fs.readFileSync(path.join(DATA, 'index.json')));
  return h.digest('hex');
};
const BEFORE = hashData();
// сухой прогон — на данных до обновления whrules-981 (история git); без них тесты пропускаются
const BASE = baseline40k();
const TB = BASE ? test : test.skip;
const R = BASE ? dryRun({ files: BASE.files }) : ({ _data: {} } as any);
const { sm, aoi } = R._data as { sm: FactionData; aoi: FactionData };
const own = (F: FactionData) => F.datasheets.filter((d) => d.group === 'own');

TB('сухой прогон не меняет данные приложения', () => {
  assert.equal(hashData(), BEFORE);
});

TB('текст: разметка wh-rules снимается, сноски вариантов снаряжения сохраняются', () => {
  assert.equal(mdToText('Gain **[gloss:hit-roll:hit rolls]** and [core:Deep Strike].'), 'Gain hit rolls and Deep Strike.');
  assert.equal(mdToText('**This model is equipped with:** 1 Bolt Pistol.'), 'This model is equipped with: 1 Bolt Pistol.');
  assert.equal(mdToText('### Heirs\n▪ one __or__ two'), 'Heirs\n• one or two');
  assert.equal(mdToText('…with 1 eviscerator.**'), '…with 1 eviscerator.**');
});

TB('цены: ступени копий, подписи состава, цены союзника', () => {
  assert.deepEqual(tierOf('1st-2nd'), { from: 1, to: 2 });
  assert.deepEqual(tierOf('3rd+'), { from: 3, to: null });
  assert.deepEqual(tierOf('1st'), { from: 1, to: 1 });
  assert.deepEqual(tierOf(undefined), { from: 1, to: null });
  const b = costsOf([{ models: 5, points: 105, note: '1st-2nd' }, { models: 10, points: 210, note: '1st-2nd' }, { models: 5, points: 120, note: '3rd+' }]);
  assert.deepEqual(b.map((x: { from: number; to: number | null; options: unknown[] }) => [x.from, x.to, x.options.length]), [[1, 2, 2], [3, null, 1]]);
  const sb = costsOf([{ models: 10, points: 200, note: '1 Sword Brother, 4 Neophytes, 5 Initiates' }]);
  assert.equal(sb[0].options[0].label, '1 Sword Brother, 4 Neophytes, 5 Initiates');
  const inq = [{ models: 1, points: 55 }, { models: 1, points: 65, note: 'Agents of the Imperium (allied)' }];
  assert.equal(costsOf(inq)[0].options[0].cost, 55);
  assert.equal(costsOf(inq, { allied: true })[0].options[0].cost, 65);
});

TB('оружие и способности: режимы оружия — профили одного оружия; параметры основных способностей', () => {
  const w = weaponsOf({ ranged: [{ name: 'Bolt Rifle – focused fire', tags: ['HEAVY'], range: '24"', a: '1', bs: '3+', s: '6', ap: '-1', d: '2' }, { name: 'Bolt Rifle – saturation', tags: [], range: '24"', a: '2', bs: '3+', s: '5', ap: '-1', d: '1' }], melee: [{ name: 'Power Fist', tags: [], a: '3', ws: '3+', s: '8', ap: '-2', d: '2' }] });
  assert.deepEqual(w.map((x: { name: string; profiles: unknown[] }) => [x.name, x.profiles.length]), [['Bolt Rifle', 2], ['Power Fist', 1]]);
  assert.deepEqual([w[0].profiles[0].range, w[0].profiles[0].skill, w[0].profiles[0].keywords, w[1].profiles[0].range], ['24', '3', 'heavy', 'Melee']);
  assert.deepEqual(coreParts('Deadly Demise D6+2'), { name: 'Deadly Demise', param: 'D6+2' });
  assert.deepEqual(coreParts('Scouts 6"'), { name: 'Scouts', param: '6"' });
  assert.deepEqual(coreParts('Damaged 5'), { name: 'Damaged', param: '5' });
  assert.deepEqual(coreParts('Lone Operative'), { name: 'Lone Operative', param: '' });
});

TB('ключевые слова цели: альтернативы, исключения, «unit only», названия инфолистов', () => {
  const v = new Set(['ADEPTUS ASTARTES', 'INFANTRY', 'MOUNTED', 'VEHICLE', 'DEDICATED TRANSPORT', 'FLY', 'WALKER', 'CALLIDUS ASSASSIN']);
  assert.deepEqual(keywordReq('ADEPTUS ASTARTES INFANTRY/MOUNTED model only.', v)?.any, [['ADEPTUS ASTARTES', 'INFANTRY'], ['ADEPTUS ASTARTES', 'MOUNTED']]);
  const r = keywordReq('One friendly ADEPTUS ASTARTES VEHICLE unit (excluding DEDICATED TRANSPORT/FLY/WALKER units).', v);
  assert.deepEqual([r?.any, r?.exclude, r?.unit], [[['ADEPTUS ASTARTES', 'VEHICLE']], ['DEDICATED TRANSPORT', 'FLY', 'WALKER'], true]);
  assert.deepEqual(keywordReq('That ADEPTUS ASTARTES INFANTRY.', v)?.any, [['ADEPTUS ASTARTES', 'INFANTRY']]);
  assert.deepEqual(keywordReq('Callidus Assassin models only. Twice per battle…', v)?.any, [['CALLIDUS ASSASSIN']]);
  assert.equal(keywordReq('That enemy unit.', v), null);
});

TB('правила армии: Combat Doctrines с доктринами; разделы — отдельные правила; одинаковый текст — одно правило', () => {
  const { rules, byFaction } = armyRulesOf(loadFull('whrules-981-full.json'));
  assert.match(rules['whr:rule:combat-doctrines'].text, /Assault Doctrine[\s\S]*Devastator Doctrine[\s\S]*Tactical Doctrine/);
  assert.ok(byFaction['space-wolves']['Curse of the Wulfen']);
  const ts = Object.values(byFaction).map((x) => (x as Record<string, string>)['Transhuman Strategist']).filter(Boolean);
  // в снимке два варианта отличаются только разметкой — после очистки текст один, правило одно на все 6 фракций
  assert.deepEqual([ts.length, new Set(ts).size], [6, 1]);
});

TB('сухой прогон: все проверки целостности проходят; итоги стабильны', () => {
  const failed = R.checks.filter((c: { ok: boolean }) => !c.ok);
  assert.deepEqual(failed, []);
  assert.equal(R.summary.spaceMarines.datasheetsAfter, 222 + 63);
  assert.equal(R.summary.spaceMarines.removedByMigration, 8);
  assert.equal(R.summary.spaceMarines.outdatedMarked, 63);
  assert.equal(R.summary.imperialAgents.datasheets, 46);
  assert.equal(R.detachments.added.length + R.detachments.kept.length, 35);
});

TB('наследие: стоимость снаряжения/добавок не из источника помечена «не проверено», значения сохранены', () => {
  const wg = R.legacy.filter((l: { field: string }) => l.field.startsWith('costs.'));
  assert.ok(wg.length > 0);
  const tas = sm.datasheets.find((d) => d.name === 'Terminator Assault Squad' && d.group === 'own')!;
  assert.ok(tas.costs.every((b) => b.wargear.length > 0 && b.wargear.every((w) => w.unverified === true)), 'текущая стоимость снаряжения не удалена и помечена «не проверено»');
  assert.equal(R.unverifiedPrices.length, 12);
  // предмета нет в инфолисте снимка — прежняя добавка убрана (в снимке Invader ATVs — отдельный инфолист)
  const out = sm.datasheets.find((d) => d.name === 'Outrider Squad' && d.group === 'own')!;
  assert.deepEqual(out.costs.flatMap((b) => b.addons), []);
  assert.ok(R.unavailable.some((x: { name: string; field: string }) => x.name === 'Outrider Squad' && x.field === 'costs.addons.1 Invader ATV'));
  // цены из источника не помечаются
  assert.ok(own(sm).every((d) => d.costs.every((b) => b.options.every((o) => !('unverified' in o)))));
  assert.ok(wg.some((l: { name: string }) => l.name === 'Terminator Assault Squad'));
});

TB('движок: каждый обновлённый инфолист добавляется в ростер и считается; варианты снаряжения разбираются', () => {
  let unparsed = 0;
  let total = 0;
  for (const F of [sm, aoi]) {
    const L = makeLookup(F);
    for (const ds of own(F)) {
      const cr = computeRoster(addUnit(newRoster(F.id), ds), L);
      assert.ok(cr.units[0]!.total > 0, `${ds.name}: цена`);
      assert.ok(!cr.issues.some((i) => i.code === 'missing' || i.code === 'no-cost'), ds.name);
      const o = optionsOf(ds);
      total += ds.options.length;
      unparsed += o.unparsed.length;
    }
  }
  // сколько вариантов снаряжения разобрано в правила (остальные показываются текстом) — фиксируем, чтобы не ухудшалось
  assert.ok(unparsed / total < 0.25, `не разобрано ${unparsed} из ${total}`);
});

TB('сохранённые ростеры: каждый текущий инфолист Space Marines открывается на новых данных (замена или тот же id)', () => {
  const cur = structuredClone(BASE!.files['SM.json']) as FactionData;
  const L = makeLookup(sm);
  let migrated = 0;
  for (const ds of cur.datasheets.filter((d: Datasheet) => d.group === 'own' || d.group === 'ally:agents')) {
    const m = migrateRoster(addUnit(newRoster('SM'), ds), L);
    const cr = computeRoster(m.roster, L);
    assert.ok(!cr.issues.some((i) => i.code === 'missing'), `${ds.name} (${ds.id})`);
    if (m.roster.units[0]!.datasheetId !== ds.id) migrated++;
    // ростер без выборов снаряжения: только отметка о применённом обновлении, юнит не меняется
    assert.deepEqual(m.roster.appliedMigrations, [sm.migrations!.source]);
  }
  assert.equal(migrated, 8);
});

TB('устаревшие детачменты, улучшения и стратагемы сохраняются; для новых ростеров недоступны; старые ростеры работают', () => {
  const o = R.outdatedRules.sm;
  assert.deepEqual([o.detachments.length, o.enhancements.length, o.stratagems.length], [34, 132, 201]);
  assert.deepEqual([R.outdatedRules.aoi.detachments.length, R.outdatedRules.aoi.enhancements.length, R.outdatedRules.aoi.stratagems.length], [0, 0, 0]);
  const cur = structuredClone(BASE!.files['SM.json']) as FactionData;
  // ничего прежнего не потеряно: каждый прежний детачмент/улучшение/стратагема есть в новых данных (тот же id)
  for (const k of ['detachments', 'enhancements', 'stratagems'] as const) {
    const ids = new Set((sm[k] as { id: string }[]).map((x) => x.id));
    assert.deepEqual((cur[k] as { id: string }[]).filter((x) => !ids.has(x.id)).map((x) => x.id), [], k);
  }
  const L = makeLookup(sm);
  const legacyDet = sm.detachments.find((d) => d.outdated && sm.enhancements.some((e) => e.detachment === d.id))!;
  const legacyEnh = sm.enhancements.find((e) => e.detachment === legacyDet.id)!;
  // новый ростер: устаревший детачмент не предлагается
  assert.ok(!availableDetachments(L, null).some((d) => d.id === legacyDet.id));
  assert.ok(availableDetachments(L, null, [legacyDet.id]).some((d) => d.id === legacyDet.id), 'уже выбранный — остаётся');
  assert.deepEqual(selectableDetachments([legacyDet], []), []);
  // старый ростер с этим детачментом и улучшением: открывается, считается, без ошибок «не найден», с предупреждениями
  const holder = cur.datasheets.find((d) => d.group === 'own' && d.enhancements.includes(legacyEnh.id) && !d.epicHero)!;
  const ds = sm.datasheets.find((d) => d.id === holder.id)!;
  let r = { ...addUnit(newRoster('SM'), ds), detachmentIds: [legacyDet.id] };
  r = updateUnit(r, r.units[0]!.uid, { enhancementId: legacyEnh.id });
  const cr = computeRoster(r, L);
  assert.ok(!cr.issues.some((i) => ['det-missing', 'enh-missing', 'enh-elig'].includes(i.code)), JSON.stringify(cr.issues.filter((i) => i.level === 'error')));
  assert.ok(cr.issues.some((i) => i.code === 'det-outdated' && i.level === 'warning'));
  assert.ok(cr.issues.some((i) => i.code === 'enh-outdated' && i.level === 'warning'));
  assert.equal(cr.units[0]!.enhancementCost, legacyEnh.cost, 'стоимость улучшения сохраняется');
  assert.ok(selectableEnhancement(legacyEnh, legacyEnh.id) && !selectableEnhancement(legacyEnh, null));
  // стратагемы: устаревшие видны только у устаревшего детачмента
  const st = sm.stratagems.find((x) => x.outdated && x.detachment === legacyDet.id)!;
  assert.ok(visibleStratagem(st, L.det));
  const stKept = sm.stratagems.find((x) => x.outdated && !L.det.get(x.detachment)?.outdated);
  if (stKept) assert.ok(!visibleStratagem(stKept, L.det), 'прежняя версия стратагемы действующего детачмента скрыта');
});

TB('улучшения: явные ограничения снимка; обычные — персонажам, Upgrade — не персонажам; неоднозначные и неразобранные — в отчёте', () => {
  const E = R.enhancementEligibility;
  assert.deepEqual([E.sm.explicit.length, E.sm.ambiguous.length, E.sm.unmatched.length], [90, 3, 0]);
  assert.deepEqual(E.sm.ambiguous.map((x: { name: string }) => x.name).sort(), ['Castellum Omnivox', 'Oathbound Exemplar', 'Spy-skull Data Link']);
  assert.deepEqual([E.aoi.explicit.length, E.aoi.ambiguous.length, E.aoi.unmatched.length], [20, 0, 0]);
  assert.deepEqual(E.sm.unmatched, []);
  const current = new Set([...sm.enhancements, ...aoi.enhancements].filter((e) => !e.outdated).map((e) => e.id));
  const E2 = new Map([...sm.enhancements, ...aoi.enhancements].map((e) => [e.id, e]));
  for (const d of [...own(sm), ...own(aoi)])
    for (const x of d.enhancements.filter((x) => current.has(x))) {
      const e = E2.get(x)!;
      assert.ok(e.upgrade ? !d.character : d.character, `${d.name}: ${e.name}`);
    }
  // «(Upgrade)» в названии сайта → поле upgrade
  assert.ok(sm.enhancements.some((e) => e.name === 'Fervent Exemplars' && e.upgrade && !e.outdated));
});

TB('подпись источника: Space Marines и Imperial Agents — wh-rules.ru 981 (MFM 1.6, 14.10.2026); остальные — выгрузка Wahapedia', () => {
  assert.equal(sourceLabel(sm.source!), 'wh-rules.ru · версия 981 · 14.10.2026');
  const idx = { lastUpdate: '2026-09-28 02:38', factions: [{ id: 'SM', name: 'Space Marines', allegiance: '', units: 0, detachments: 0 }, { id: 'AoI', name: 'Imperial Agents', allegiance: '', units: 0, detachments: 0 }], updates: [R.scope.indexUpdate] };
  assert.equal(factionCredit(aoi, idx), 'Очки и правила: MFM 1.6 · wh-rules.ru 981 · 14.10.2026');
  const other = JSON.parse(fs.readFileSync(path.join(DATA, 'f', 'NEC.json'), 'utf8')) as FactionData;
  assert.equal(factionCredit(other, idx), 'powered by Wahapedia · 28.09.2026');
  assert.equal(indexCredit(idx), 'Очки: MFM 1.6 · wh-rules.ru 981 · 14.10.2026');
});

TB('границы обновления: меняются только SM, AoI и копии Imperial Agents в AC, AM, AS, AdM, GK, QI, TL', () => {
  const changed = Object.entries(R.scope.files).filter(([, v]) => v !== 'без изменений').map(([f]) => f).sort();
  assert.deepEqual(changed, ['AC.json', 'AM.json', 'AS.json', 'AdM.json', 'AoI.json', 'GK.json', 'QI.json', 'SM.json', 'TL.json']);
  assert.ok(R.checks.find((c: { check: string }) => c.check.startsWith('границы'))!.ok);
  assert.deepEqual(R.scope.indexUpdate.scope, ['SM', 'AoI']);
});
