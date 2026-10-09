// Age of Sigmar: структура данных и связи между ними — сезоны, улучшения, лоры, ссылки правил на таблицы.
// Эти тесты ловят то, что раньше молча пропадало с экрана. Запуск: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  computeAos,
  eligibleFor,
  enhancementFit,
  formationFit,
  formationsOf,
  leaderFit,
  loreFit,
  loresOf,
  makeAosLookup,
  warscrollFit,
} from '../../../client/src/features/roster/aos/engine';
import { AOS_SEASONS, isSeasonal, seasonActive, seasonLabel, seasonVersion } from '../../../client/src/features/roster/aos/rules';
import { activeTables, castInfo, grantsOf, isCastable, ruleRefs } from '../../../client/src/features/roster/aos/refs';
import { addRegiment, newAosRoster, setEnhancement, setLore } from '../../../client/src/features/roster/aos/roster';
import type { AosFactionData, AosIndex, AosRoster } from '../../../client/src/features/roster/aos/types';

const dir = path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data', 'aos');
const INDEX: AosIndex = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
const load = (id: string): AosFactionData => JSON.parse(fs.readFileSync(path.join(dir, 'f', id + '.json'), 'utf8'));
const ALL = INDEX.factions.map((f) => load(f.id));
const curated = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'aos', 'curated.json'), 'utf8'));
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

// ---------- сезоны ----------

test('сезоны: клиент и импортёр описывают одни и те же сезоны', () => {
  const imp = Object.fromEntries(Object.entries(curated.seasonInfo).filter(([k]) => k !== 'about')) as Record<string, { label: string; active: boolean }>;
  assert.deepEqual(Object.keys(AOS_SEASONS).sort(), Object.keys(imp).sort(), 'AOS_SEASONS (rules.ts) и curated.json → seasonInfo');
  for (const [k, v] of Object.entries(AOS_SEASONS)) {
    assert.equal(v.label, imp[k]!.label, `${k}: подпись`);
    assert.equal(v.active, imp[k]!.active, `${k}: действует ли сезон`);
  }
});

test('сезоны: в данных нет неописанных сезонов (новый сезон не пропадёт молча)', () => {
  const ok = (s: unknown, where: string) => assert.ok(s == null || s === 'standard' || (typeof s === 'string' && s in AOS_SEASONS), `${where}: сезон «${s}» не описан в AOS_SEASONS`);
  for (const f of ALL) {
    for (const w of [...f.warscrolls, ...f.rorUnits, ...f.universalManifestations]) ok(w.season, `${f.id} ${w.name}`);
    for (const t of f.enhancementTypes) for (const tb of t.tables) ok(tb.season, `${f.id} ${tb.name}`);
    for (const l of f.lores) ok(l.season, `${f.id} ${l.name}`);
    for (const fm of f.formations) {
      assert.ok('season' in fm, `${f.id} ${fm.name}: у построения нет сезона`);
      ok(fm.season, `${f.id} ${fm.name}`);
    }
  }
});

test('сезоны: помощники одинаково понимают обычные, действующие, закончившиеся и неизвестные сезоны', () => {
  assert.equal(isSeasonal('standard'), false);
  assert.equal(isSeasonal(null), false);
  assert.equal(isSeasonal('aqshy'), true);
  assert.equal(seasonActive('standard'), true);
  assert.equal(seasonActive(undefined), true);
  assert.equal(seasonActive('aqshy'), true);
  assert.equal(seasonActive('ghyran'), false);
  // неизвестный сезон не разрешается молча — его нужно описать
  assert.equal(seasonActive('scourge-of-2030'), false);
  assert.equal(seasonLabel('aqshy'), 'Scourge of Aqshy');
  assert.equal(seasonLabel('standard'), null);
  assert.equal(seasonVersion(null), 'standard');
  assert.equal(seasonVersion('aqshy'), 'aqshy');
});

test('сезоны: закончившийся сезон блокируется для юнитов, лоров, построений и таблиц — с понятной причиной', () => {
  const f = clone(ALL.find((x) => x.id === 'SE')!);
  // делаем копии с сезоном Ghyran (закончился)
  const unit = f.warscrolls.find((w) => w.kind === 'unit' && w.hero && w.cost != null && !w.unique && !w.legends && !w.season)!;
  f.warscrolls.push({ ...clone(unit), id: 'old-hero', name: 'Scourge of Ghyran ' + unit.name, season: 'ghyran' });
  f.lores.push({ ...clone(f.lores.find((l) => l.kind === 'spell')!), id: 'old-lore', season: 'ghyran' });
  f.formations.push({ ...clone(f.formations[0]!), id: 'old-form', season: 'ghyran' });
  const art = f.enhancementTypes.find((t) => t.key === 'artefact')!;
  art.tables.push({ ...clone(art.tables[0]!), id: 'old-table', season: 'ghyran', items: art.tables[0]!.items.map((i) => ({ ...i, id: 'old-' + i.id })) });
  const L = makeAosLookup(f);
  const r = newAosRoster('SE');
  const w = warscrollFit(L.ws.get('old-hero')!, r, L);
  assert.ok(!w.ok && /Scourge of Ghyran — сезон закончился/.test(w.reason));
  assert.ok(!loresOf('spell', L).some((l) => l.id === 'old-lore'));
  assert.ok(!loreFit(L.lore.get('old-lore')!, r, L).ok);
  assert.ok(!formationsOf(L).some((x) => x.id === 'old-form'));
  assert.ok(!formationFit(L.formation.get('old-form')!, r, L).ok);
  assert.ok(!activeTables(art).some((t) => t.id === 'old-table'));
  // ростер из старого кода с такими выборами — ошибки, а не тихий пропуск
  let rr: AosRoster = { ...r, formationId: 'old-form' };
  rr = setLore(rr, 'spell', 'old-lore');
  const lead = addRegiment(rr, unit, L);
  assert.ok(lead.ok);
  rr = setEnhancement(lead.roster, lead.roster.regiments[0]!.leader.uid, 'artefact', 'old-' + art.tables[0]!.items[0]!.id);
  const fit = enhancementFit(rr.regiments[0]!.leader, 'old-' + art.tables[0]!.items[1]!.id, { ...rr, regiments: [{ ...rr.regiments[0]!, leader: { ...rr.regiments[0]!.leader, enhancements: {} } }] }, L);
  assert.ok(!fit.ok && /сезон Scourge of Ghyran закончился/.test(fit.reason));
  const codes = computeAos(rr, L).issues.map((i) => i.code);
  for (const c of ['formation', 'lore', 'enh-season']) assert.ok(codes.includes(c), `ожидалась ошибка ${c}: ${codes.join(', ')}`);
});

test('сезоны: новый сезон работает без правок кода — достаточно описать его в AOS_SEASONS', () => {
  const f = clone(ALL.find((x) => x.id === 'GG')!);
  const hero = f.warscrolls.find((w) => w.hero && w.cost != null && !w.unique && !w.legends && !w.season && w.kind === 'unit')!;
  f.warscrolls.push({ ...clone(hero), id: 'new-hero', name: 'Scourge of Tomorrow ' + hero.name, season: 'tomorrow' });
  const L = makeAosLookup(f);
  const r = newAosRoster('GG');
  assert.ok(!warscrollFit(L.ws.get('new-hero')!, r, L).ok, 'неописанный сезон не разрешается');
  AOS_SEASONS.tomorrow = { label: 'Scourge of Tomorrow', active: true };
  try {
    assert.ok(warscrollFit(L.ws.get('new-hero')!, r, L).ok, 'описанный действующий сезон разрешается');
    assert.ok(leaderFit(L.ws.get('new-hero')!, r, L).ok);
  } finally {
    delete AOS_SEASONS.tomorrow;
  }
});

// ---------- улучшения: ничего не пропадает с экрана ----------

test('улучшения: каждая действующая таблица (и сезонная) есть в обзоре армии и кому-то доступна', () => {
  for (const f of ALL) {
    const L = makeAosLookup(f);
    // Legends включены: у фракций «только Legends» (Beasts of Chaos) иначе вообще некого брать
    const r = { ...newAosRoster(f.id), showLegends: true };
    const usable = f.warscrolls.filter((w) => w.kind === 'unit' && warscrollFit(w, r, L).ok && !w.unique);
    for (const type of f.enhancementTypes) {
      const shown = activeTables(type);
      for (const tb of type.tables.filter((t) => seasonActive(t.season))) {
        assert.ok(shown.includes(tb), `${f.id}: таблица «${tb.name}» не попадает в обзор`);
        assert.ok(tb.items.length > 0, `${f.id}: пустая таблица «${tb.name}»`);
        for (const it of tb.items) assert.ok(L.enh.get(it.id)?.table === tb, `${f.id}: «${it.name}» не связано со своей таблицей`);
        assert.ok(usable.some((w) => eligibleFor(w, tb)), `${f.id}: таблицу «${tb.name}» (${tb.season}) некому дать — условие «${tb.eligibility.text}»`);
      }
      // сезонная обычного типа делит слот с обычной; отдельный тип — свой слот
      const seasonal = type.tables.some((t) => isSeasonal(t.season));
      for (const tb of type.tables) for (const it of tb.items) assert.equal(L.enh.get(it.id)!.slot, seasonal ? 'type:' + type.key : 'table:' + tb.id);
    }
  }
});

test('улучшения от способностей: построение Kharadron даёт артефакт из двух таблиц — связь видна', () => {
  const f = ALL.find((x) => x.id === 'KO')!;
  const L = makeAosLookup(f);
  const fm = f.formations.find((x) => x.name === 'Endrineers Guild Expeditionary Force')!;
  const refs = ruleRefs(fm.rules[0]!.text, L);
  assert.deepEqual(refs.tables.map((t) => t.table.name).sort(), ['Ingenious Innovations', 'Inventions of the Sky-Ports']);
  const r: AosRoster = { ...newAosRoster('KO'), formationId: fm.id };
  const grants = grantsOf(r, L);
  assert.ok(grants.some((g) => g.source.includes('Endrineers Guild') && g.rule.name === 'SPECIAL PROCUREMENT'));
  assert.equal(grantsOf(newAosRoster('KO'), L).some((g) => g.rule.name === 'SPECIAL PROCUREMENT'), false, 'без построения связи нет');
});

test('ссылки правил: только на существующие действующие таблицы и лоры, без ложных совпадений по коротким именам', () => {
  for (const f of ALL) {
    const L = makeAosLookup(f);
    const rules = [...f.battleTraits, ...f.formations.flatMap((x) => x.rules), ...f.warscrolls.flatMap((w) => w.abilities)];
    for (const rule of rules) {
      const refs = ruleRefs(rule.text, L);
      for (const t of refs.tables) {
        assert.ok(seasonActive(t.table.season));
        assert.ok(t.table.name.length >= 6);
      }
      for (const l of refs.lores) assert.ok(!l.universal && seasonActive(l.season));
    }
  }
});

// ---------- заклинания ----------

test('каст: значения разбираются и показываются крупно', () => {
  assert.deepEqual(castInfo('Spell 7'), { kind: 'spell', n: 7, label: 'Каст', short: '7+' });
  assert.deepEqual(castInfo('Prayer 4'), { kind: 'prayer', n: 4, label: 'Молитва', short: '4+' });
  assert.deepEqual(castInfo('Command 1'), { kind: 'command', n: 1, label: 'Команда', short: '1 CP' });
  assert.deepEqual(castInfo('Fate 2+'), { kind: 'other', n: 2, label: 'Fate', short: '2' });
  assert.equal(castInfo('Blood tithe 3')?.label, 'Blood tithe');
  assert.equal(castInfo(''), null);
  assert.equal(castInfo(undefined), null);
});

test('каст: у каждого заклинания и молитвы в лорах есть значение каста', () => {
  for (const f of ALL)
    for (const l of f.lores) {
      if (!seasonActive(l.season)) continue;
      for (const it of l.items) {
        const c = castInfo(it.value);
        assert.ok(c, `${f.id} «${l.name}» → «${it.name}»: нет значения каста`);
        if (l.kind === 'prayer') assert.equal(c!.kind, 'prayer', `${f.id} «${it.name}»`);
        if (l.kind === 'spell') assert.equal(c!.kind, 'spell', `${f.id} «${it.name}»`);
        assert.ok(isCastable(it));
      }
    }
});
