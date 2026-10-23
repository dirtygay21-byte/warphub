// Карты миссий (P2-T1): backend/roster-data/missions.json, тексты 40k/missions-ru.json, сверка 40k/missions-review.json.
// Запуск: npm test. Сверка с 40kdc-data выполняется, если папка tools/roster-data/40kdc-data на месте.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildMissions, vpDiff } from '../scripts/build-missions.mjs';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');
const read = (...p: string[]) => JSON.parse(fs.readFileSync(path.join(ROOT, ...p), 'utf8'));
const missions = read('backend', 'roster-data', 'missions.json');
const battlefield = read('backend', 'roster-data', 'battlefield.json');
const KDC = path.join(ROOT, 'tools', 'roster-data', '40kdc-data', 'data', 'core');
const ROUNDS = new Set(['any', '1', '1–2', '2+', '2–3', '2–4', '4+', '5', 'end']);

test('43 карты: 25 основных и 18 вторичных, id уникальны', () => {
  const ids = missions.cards.map((c: { id: string }) => c.id);
  assert.equal(ids.length, 43);
  assert.equal(new Set(ids).size, 43);
  assert.equal(missions.cards.filter((c: { type: string }) => c.type === 'primary').length, 25);
});

test('у каждой пары типов армий «Поля боя» есть основная миссия с той же парой', () => {
  const byId = new Map(missions.cards.map((c: { id: string }) => [c.id, c]));
  assert.equal(battlefield.matchups.length, 25);
  for (const m of battlefield.matchups) {
    const c = byId.get(m.mission) as { type: string; you: string; foe: string } | undefined;
    assert.ok(c, `нет карты ${m.mission}`);
    assert.equal(c.type, 'primary');
    assert.deepEqual([c.you, c.foe], [m.you, m.foe], m.mission);
  }
});

test('тексты заполнены, на русском, очки — целые положительные, раунды из известного набора', () => {
  const cyr = /[А-Яа-яЁё]/;
  for (const c of missions.cards) {
    assert.ok(c.blocks.length, c.id);
    for (const k of ['setup', 'drawn', 'note'] as const) if (c[k] !== undefined) assert.ok(cyr.test(c[k]), `${c.id}.${k}`);
    if (c.type === 'secondary') assert.ok(c.modes?.length, `${c.id}: режим`);
    for (const b of c.blocks) {
      assert.ok(ROUNDS.has(b.rounds), `${c.id}: раунд ${b.rounds}`);
      assert.ok(cyr.test(b.when), `${c.id}: когда`);
      if (c.type === 'secondary') assert.ok(c.modes.includes(b.mode), `${c.id}: режим блока ${b.mode}`);
      b.rows.forEach((r: { text: string; vp: number; plus?: boolean; or?: boolean; max?: number }, i: number) => {
        assert.ok(cyr.test(r.text), `${c.id}: текст`);
        assert.ok(Number.isInteger(r.vp) && r.vp > 0, `${c.id}: ПО ${r.vp}`);
        if (r.plus || r.or) assert.ok(i > 0, `${c.id}: «+»/«или» не может быть первой строкой`);
        if (r.max !== undefined) assert.ok(r.max >= r.vp, `${c.id}: максимум`);
      });
    }
    for (const a of c.actions ?? []) for (const k of ['nameRu', 'starts', 'units', 'limit', 'completes', 'effect']) assert.ok(cyr.test(a[k]), `${c.id}: действие ${k}`);
  }
});

test('лимиты ПО: 15 за раунд и 45 за битву, 20 за фиксированную вторичную, ПО конца битвы вне лимита раунда', () => {
  assert.deepEqual(missions.caps, { primaryRound: 15, primaryGame: 45, secondaryRound: 15, secondaryGame: 45, fixedSecondaryCard: 20, endOfBattleOutsideRoundCap: true });
});

test('сборщик: пропущенная карта, расхождение очков и неверное время вторичной останавливают сборку; записанный конфликт пропускается', () => {
  const kdc = [{ id: 'a', name: 'A', card_type: 'secondary', awards: [{ vp: 3 }] }];
  const ru = (vp: number, turn = 'own', when = 'Конец вашего хода') => ({ terms: {}, cards: { a: { type: 'secondary', modes: ['tactical'], blocks: [{ rounds: 'any', mode: 'tactical', when, turn, rows: [{ text: 'т', vp }] }] } } });
  const base = { cards: kdc, missions: [{ vp_per_round_cap: 15, vp_per_game_cap: 45, secondary_vp_per_round_cap: 15, secondary_vp_per_game_cap: 45 }], matchups: [], version: 't' };
  assert.equal(buildMissions({ ...base, ru: ru(3), review: {} }).cards.length, 1);
  assert.throws(() => buildMissions({ ...base, ru: ru(4), review: {} }), /очки расходятся/);
  assert.throws(() => buildMissions({ ...base, ru: ru(3, 'any'), review: {} }), /turn any, по тексту «Конец вашего хода» нужно own/);
  assert.throws(() => buildMissions({ ...base, ru: ru(3, 'own', 'Конец'), review: {} }), /неизвестное время «Конец»/);
  assert.throws(() => buildMissions({ ...base, cards: [...kdc, { id: 'b', name: 'B', card_type: 'primary', awards: [] }], ru: ru(3), review: {} }), /нет текста карты b/);
  const review = { conflicts: [{ card: 'a', vpDiff: vpDiff(ru(4).cards.a, kdc[0]) }] };
  assert.equal(buildMissions({ ...base, ru: ru(4), review }).cards.length, 1);
});

test('missions.json совпадает со сборкой из 40kdc-data (если выгрузка на месте)', { skip: !fs.existsSync(KDC) && 'нет tools/roster-data/40kdc-data' }, () => {
  const rd = (f: string) => JSON.parse(fs.readFileSync(path.join(KDC, f), 'utf8'));
  const rebuilt = buildMissions({
    cards: rd('mission-cards.json'),
    missions: rd('missions.json'),
    matchups: rd('mission-matchups.json'),
    ru: read('tools', 'roster-data', '40k', 'missions-ru.json'),
    review: read('tools', 'roster-data', '40k', 'missions-review.json'),
    version: missions.source.version,
  });
  assert.deepEqual(rebuilt, missions);
});
