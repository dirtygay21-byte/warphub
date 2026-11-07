// P1-T6: версия данных в приложении — откуда очки и правила у каждой армии 40K (engine/source.ts). Запуск: bun test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { factionCredit, indexCredit, indexCreditDetails, pointsUpdateFor } from '../../../client/src/features/roster/engine/source';
import { computeRoster, makeLookup } from '../../../client/src/features/roster/engine/compute';
import { exportGw } from '../../../client/src/features/roster/engine/export';
import { newRoster } from '../../../client/src/features/roster/engine/roster';
import type { DataIndex, FactionData } from '../../../client/src/features/roster/engine/types';

const DATA = path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data');
const index = JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'), 'utf8')) as DataIndex;
const fac = (id: string) => JSON.parse(fs.readFileSync(path.join(DATA, 'f', id + '.json'), 'utf8')) as FactionData;

test('армия только с обновлением очков: очки — wh-rules.ru 995 и MFM, правила — выгрузка Wahapedia', () => {
  // с 07.11.2026 (Task C, партия 4) все армии с обновлением очков сконвертированы; армия без своего источника — синтетическая
  assert.equal(factionCredit({ ...fac('ORK'), source: undefined }, index), 'Очки: MFM 1.6 · wh-rules.ru 995 · 16.10.2026 · правила: Wahapedia · 28.09.2026');
  assert.equal(factionCredit(fac('ORK'), index), 'Очки и правила: MFM 1.6 · wh-rules.ru 995 · 16.10.2026');
});

test('армия, сконвертированная целиком той же версией: «Очки и правила» одной строкой (Adeptus Custodes)', () => {
  assert.equal(factionCredit(fac('AC'), index), 'Очки и правила: MFM 1.6 · wh-rules.ru 995 · 16.10.2026');
});

test('правила из другой версии сайта: Space Marines — правила wh-rules.ru 981, очки 995', () => {
  assert.equal(factionCredit(fac('SM'), index), 'Очки: MFM 1.6 · wh-rules.ru 995 · 16.10.2026 · правила: wh-rules.ru 981 · 14.10.2026');
});

test('армии без обновлений — по-прежнему выгрузка Wahapedia; ни одна армия с обновлением очков не подписана «powered by Wahapedia»', () => {
  assert.equal(factionCredit({ id: 'XX' }, index), 'powered by Wahapedia · 28.09.2026');
  for (const f of index.factions) {
    if (!pointsUpdateFor(index, f.id)) continue;
    assert.doesNotMatch(factionCredit(fac(f.id), index), /powered by/, f.id);
  }
});

test('список ростеров: одна короткая строка и подробности по каждому обновлению с армиями', () => {
  assert.equal(indexCredit(index), 'Очки: MFM 1.6 · wh-rules.ru 995 · 16.10.2026');
  const d = indexCreditDetails(index);
  assert.equal(d.length, 1 + (index.updates ?? []).length);
  assert.match(d[0]!.title, /Wahapedia · 28\.09\.2026/);
  assert.ok(d.slice(1).every((x) => /Армии: .+\./.test(x.text) && !/paidDefaults|whrules/.test(x.text)));
  assert.ok(d.some((x) => /Orks/.test(x.text)));
});

test('экспорт в формате GW: версия очков и правил на английском', () => {
  const F = fac('ORK');
  const L = makeLookup(F);
  const r = newRoster('ORK', 'strike', index.lastUpdate);
  const text = exportGw(r, L, computeRoster(r, L), index.lastUpdate, factionCredit({ ...F, source: undefined }, index, 'en'));
  assert.match(text, /\(data: points: MFM 1\.6 · wh-rules\.ru 995 · 16\.10\.2026; rules: Wahapedia · 28\.09\.2026\)$/);
});
