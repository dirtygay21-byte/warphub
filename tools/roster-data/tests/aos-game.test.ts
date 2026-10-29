// «Начать игру» AoS, S5: движок по General's Handbook 2026-27 (client/src/features/roster/aosgame). Запуск: bun test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  aosResult,
  aosSetupMissing,
  aosTotals,
  aosUndoTarget,
  applyAosEvent,
  battleplanRoll,
  loadAosGame,
  readAosLibrary,
  removeAosGame,
  saveAosGame,
  priorityRoll,
  replayAos,
  rolesRoll,
  type AosCatalog,
  type AosEventBody,
  type AosGameEvent,
  type AosGameState,
  type Seat,
} from '../../../client/src/features/roster/aosgame';

const cat = JSON.parse(readFileSync(join(import.meta.dirname, '../../../backend/roster-data/aos/battlepack.json'), 'utf8')) as AosCatalog;
const SEED = 'aos-seed-1';
type Body = AosEventBody & { seat?: Seat | null };

function log(...bodies: Body[]): AosGameEvent[] {
  return bodies.map((b, i) => ({ seat: null, ...b, id: `e${i + 1}`, seq: i + 1, at: '2026-10-30T10:00:00Z' }) as AosGameEvent);
}
const ok = (r: ReturnType<typeof replayAos>): AosGameState => {
  assert.ok(r.ok, r.ok ? '' : `№${r.seq}: ${r.error}`);
  return r.state;
};
const roster = (name: string, aux: number) => ({ source: 'own' as const, rosterId: name, name, factionId: 'SCE', points: 2000, auxiliaries: aux });
const setup = (): Body[] => [
  { type: 'game-created', schema: 1, seed: SEED, names: { p1: 'Аня', p2: 'Борис' } },
  { type: 'player-set', target: 'p1', patch: { roster: roster('a', 0), tacticCards: ['smokescreen', 'siege-of-ashes'] } },
  { type: 'player-set', target: 'p2', patch: { roster: roster('b', 1), tacticCards: ['legend-of-the-parch'] } },
  { type: 'battleplan-set', n: 1, source: 'manual' },
  { type: 'roles-set', attacker: 'p1', source: 'manual' },
  { type: 'territory-set', territory: 'Север' },
  { type: 'tactics-revealed' },
  { type: 'battle-started' },
];
const round = (first: Seat, a: Body[] = [], b: Body[] = []): Body[] => [{ type: 'round-started', first, source: 'manual' }, ...a, { type: 'turn-ended' }, ...b, { type: 'turn-ended' }];

test('броски по seed: одинаковые при повторе, батлплан 1–12 по таблицам, priority — ничья решает прошлый первый', () => {
  for (let a = 0; a < 30; a++) {
    const r = battleplanRoll(SEED, a);
    assert.deepEqual(r, battleplanRoll(SEED, a));
    assert.equal(r.table, r.tableDie <= 3 ? 1 : 2);
    assert.equal(r.n, (r.table - 1) * 6 + r.planDie);
  }
  assert.deepEqual(rolesRoll(SEED, 0), rolesRoll(SEED, 0));
  let tie = null;
  for (let a = 0; a < 200 && !tie; a++) {
    const r = priorityRoll(SEED, 2, a, 'p2');
    if (!r.winner) tie = r;
  }
  assert.ok(tie && tie.decider === 'p2', 'ничья в priority: решает ходивший первым в прошлом раунде');
  for (let a = 0; a < 50; a++) assert.ok(priorityRoll(SEED, 1, a, null).winner, 'в первом раунде ничья перебрасывается');
});

test('подготовка: всё обязательно до начала битвы; ярость атакующего 1, защитника 2', () => {
  const r = replayAos(log(setup()[0]!, { type: 'battle-started' }), cat);
  assert.equal(r.ok, false);
  const s0 = ok(replayAos(log(setup()[0]!), cat));
  assert.equal(aosSetupMissing(s0).length, 6, "два ростера, батлплан, роли, территория, тактики");
  const s = ok(replayAos(log(...setup()), cat));
  assert.equal(s.stage, 'battle');
  assert.deepEqual([s.players.p1.fury, s.players.p2.fury], [1, 2]);
  assert.equal(replayAos(log(...setup().slice(0, 1), { type: 'player-set', target: 'p1', patch: { tacticCards: ['smokescreen', 'siege-of-ashes', 'legend-of-the-parch'] } }), cat).ok, false, 'не больше 2 карт');
});

test('раунд: CP 4 (+1 underdog, +1 меньше вспомогательных), кубы ярости, ходы по очереди, 5 раундов — конец', () => {
  const s1 = ok(replayAos(log(...setup(), { type: 'round-started', first: 'p1', source: 'manual' }), cat));
  // ПО поровну — underdog нет; у p1 меньше вспомогательных (0 < 1) → +1
  assert.equal(s1.underdog, null);
  assert.deepEqual([s1.players.p1.cp, s1.players.p2.cp], [5, 4]);
  assert.deepEqual([s1.players.p1.rage, s1.players.p2.rage], [1, 2]);
  assert.equal(s1.activeSeat, 'p1');
  const score: Body = { type: 'plan-scored', target: 'p1', rows: [0, 1, 2], seat: 'p1' };
  const s2 = ok(replayAos(log(...setup(), ...round('p1', [score]), { type: 'round-started', first: 'p2', source: 'manual' }), cat));
  assert.equal(aosTotals(s2, 'p1', cat).total, 10);
  assert.equal(s2.underdog, 'p2');
  assert.deepEqual([s2.players.p1.cp, s2.players.p2.cp], [5, 5], 'p1: 4 + меньше вспомогательных; p2: 4 + underdog');
  const end = ok(replayAos(log(...setup(), ...round('p1'), ...round('p2'), ...round('p1'), ...round('p2'), ...round('p1')), cat));
  assert.equal(end.stage, 'finished');
  assert.equal(end.endReason, 'rounds');
});

test('строки батлплана: только активный в свой ход, раз за ход, по раундам (Bloodstained Coasts: 1 / 2+)', () => {
  const base = [...setup().slice(0, 3), { type: 'battleplan-set', n: 2, source: 'manual' } as Body, ...setup().slice(4)];
  const s = ok(replayAos(log(...base, { type: 'round-started', first: 'p1', source: 'manual' }), cat));
  const ev = (body: Body, seq: number) => ({ seat: null, ...body, id: `x${seq}`, seq, at: '' }) as AosGameEvent;
  assert.equal(applyAosEvent(s, ev({ type: 'plan-scored', target: 'p1', rows: [2] }, s.lastSeq + 1), cat).ok, true, 'раунд 1: строка «первый раунд»');
  assert.equal(applyAosEvent(s, ev({ type: 'plan-scored', target: 'p1', rows: [3] }, s.lastSeq + 1), cat).ok, false, 'строка «со второго раунда» — нет');
  assert.equal(applyAosEvent(s, ev({ type: 'plan-scored', target: 'p2', rows: [0] }, s.lastSeq + 1), cat).ok, false, 'не свой ход');
  const twice = replayAos(log(...base, { type: 'round-started', first: 'p1', source: 'manual' }, { type: 'plan-scored', target: 'p1', rows: [0] }, { type: 'plan-scored', target: 'p1', rows: [0] }), cat);
  assert.equal(twice.ok, false);
});

test('тактики: по порядку, одна с карты за ход, 5 ПО; не в ход перехвата инициативы', () => {
  const t = (tier: string, card = 'smokescreen'): Body => ({ type: 'tactic-completed', target: 'p1', card, tier } as Body);
  assert.equal(replayAos(log(...setup(), { type: 'round-started', first: 'p1', source: 'manual' }, t('strike')), cat).ok, false, 'сначала Affray');
  assert.equal(replayAos(log(...setup(), { type: 'round-started', first: 'p1', source: 'manual' }, t('affray'), t('strike')), cat).ok, false, 'одна с карты за ход');
  const s = ok(replayAos(log(...setup(), { type: 'round-started', first: 'p1', source: 'manual' }, t('affray'), t('affray', 'siege-of-ashes')), cat));
  assert.equal(aosTotals(s, 'p1', cat).tactics, 10);
  // перехват: p1 ходил первым, p2 вторым; во 2-м раунде p2 ходит первым (решил сам) — тактики p2 в этот ход нельзя
  const seize = log(...setup(), ...round('p1'), { type: 'round-started', first: 'p2', source: 'manual' }, { type: 'tactic-completed', target: 'p2', card: 'legend-of-the-parch', tier: 'affray' });
  const r = replayAos(seize, cat);
  assert.equal(r.ok, false);
  assert.match(r.ok ? '' : r.error, /перехвата/);
});

test('перехват нельзя при отставании на 11+ ПО; отмена — стек; итог: крупная / малая / по тактикам / сдача', () => {
  const adj = (target: Seat, delta: number): Body => ({ type: 'vp-adjusted', target, delta, note: 'тест' });
  const blocked = replayAos(log(...setup(), ...round('p1', [adj('p1', 11)]), { type: 'round-started', first: 'p2', source: 'manual' }), cat);
  assert.equal(blocked.ok, false);
  const events = log(...setup(), { type: 'round-started', first: 'p1', source: 'manual' }, adj('p1', 3));
  assert.equal(aosUndoTarget(events)!.id, events.at(-1)!.id);
  const undone = ok(replayAos([...events, { id: 'u', seq: events.length + 1, seat: null, at: '', type: 'event-reverted', target: events.at(-1)!.id }], cat));
  assert.equal(aosTotals(undone, 'p1', cat).total, 0);
  const finish = (extra: Body[]) => ok(replayAos(log(...setup(), { type: 'round-started', first: 'p1', source: 'manual' }, ...extra, { type: 'battle-ended', reason: 'manual' }), cat));
  assert.deepEqual(aosResult(finish([adj('p1', 6)]), cat)!.kind, 'major');
  assert.deepEqual(aosResult(finish([adj('p1', 4)]), cat)!.kind, 'minor');
  assert.deepEqual(aosResult(finish([]), cat)!.kind, 'draw');
  const tac = aosResult(finish([{ type: 'tactic-completed', target: 'p1', card: 'smokescreen', tier: 'affray' }, adj('p2', 5)]), cat)!;
  assert.deepEqual([tac.winner, tac.kind, tac.by], ['p1', 'minor', 'tactics']);
  const conceded = ok(replayAos(log(...setup(), { type: 'round-started', first: 'p1', source: 'manual' }, adj('p1', 20), { type: 'battle-ended', reason: 'concede', by: 'p1', seat: 'p1' }), cat));
  assert.equal(aosResult(conceded, cat)!.winner, 'p2');
});

test('случайные броски в журнале сверяются с seed', () => {
  const bp = battleplanRoll(SEED, 0);
  assert.equal(replayAos(log(setup()[0]!, { type: 'battleplan-set', n: bp.n, source: 'random', roll: { attempt: 0 } }), cat).ok, true);
  assert.equal(replayAos(log(setup()[0]!, { type: 'battleplan-set', n: (bp.n % 12) + 1, source: 'random', roll: { attempt: 0 } }), cat).ok, false);
  const pr = priorityRoll(SEED, 1, 0, null);
  const s = ok(replayAos(log(...setup(), { type: 'round-started', first: pr.decider, source: 'random', roll: { attempt: 0 }, seat: pr.decider }), cat));
  assert.equal(s.priority!.decider, pr.decider);
  const loser: Seat = pr.decider === 'p1' ? 'p2' : 'p1';
  assert.equal(replayAos(log(...setup(), { type: 'round-started', first: loser, source: 'random', roll: { attempt: 0 }, seat: loser }), cat).ok, false, 'решает победитель priority');
});

test('сохранённые игры AoS: сводка, открытие журнала, удаление; отдельный ключ от 40K', () => {
  const mem = new Map<string, string>();
  const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
  const events = log(...setup(), ...round('p1', [{ type: 'plan-scored', target: 'p1', rows: [0] }]));
  const st = ok(replayAos(events, cat));
  assert.equal(saveAosGame(store, '.42', events, st, cat), null);
  const [entry] = readAosLibrary(store, '.42');
  assert.ok(entry);
  assert.equal(entry.key, 'e1');
  assert.deepEqual(entry.summary.names, { p1: 'Аня', p2: 'Борис' });
  assert.equal(entry.summary.battleplan, 'Into the Fire');
  assert.deepEqual(entry.summary.score, { p1: 3, p2: 0 });
  assert.ok([...mem.keys()].every((k) => k.startsWith('warphub.game.aos.')));
  assert.equal(readAosLibrary(store, '.7').length, 0, 'другой пользователь Telegram не видит игру');
  const back = loadAosGame(store, '.42', 'e1', cat);
  assert.ok(typeof back !== 'string');
  assert.deepEqual(back.state, st);
  assert.equal(removeAosGame(store, '.42', 'e1'), null);
  assert.equal(readAosLibrary(store, '.42').length, 0);
  assert.equal(loadAosGame(store, '.42', 'e1', cat), 'Игра не найдена на телефоне');
});

test('смена батлплана сбрасывает территорию (A/B — по карте батлплана), тот же батлплан — нет', () => {
  const base = setup().filter((b) => b.type !== 'tactics-revealed' && b.type !== 'battle-started');
  const st = ok(replayAos(log(...base, { type: 'battleplan-set', n: 1, source: 'manual' }), cat));
  assert.equal(st.territory, 'Север');
  const st2 = ok(replayAos(log(...base, { type: 'battleplan-set', n: 2, source: 'manual' }), cat));
  assert.equal(st2.territory, null);
  const st3 = ok(replayAos(log(...base, { type: 'battleplan-set', n: 2, source: 'manual' }, { type: 'territory-set', territory: 'B' }), cat));
  assert.equal(st3.territory, 'B');
});
