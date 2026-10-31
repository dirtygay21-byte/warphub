// «Начать игру», DM1 (31.10.2026): режим Dominatus — фаза и локация (D6 по seed), альянсы, Agenda вместо основной
// миссии (только если оба играют Agenda), улучшения, «конец раунда», Agenda Achieved и награды после битвы.
import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { replay } from '../../../client/src/features/roster/game/reducer';
import { rollD6 } from '../../../client/src/features/roster/game/rng';
import { setupMissing } from '../../../client/src/features/roster/game/setup';
import type { GameCatalog } from '../../../client/src/features/roster/game/types';
import { dominatusCatalog } from '../../../client/src/features/roster/dominatus/catalog';
import { dominatusRewards } from '../../../client/src/features/roster/dominatus/rewards';
import { catalog as standard, rawLog, setupBodies, type Body } from './game-helpers';

const dom = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data', 'dominatus.json'), 'utf8'));
const d = dominatusCatalog(dom);
const catalog: GameCatalog = { ...standard, cards: [...standard.cards, ...d.cards], dominatus: d.dominatus };

const base = setupBodies();
const created = { ...(base[0] as object), mode: 'dominatus' } as Body;
/** Подготовка Dominatus: фаза 1 (Mannheim Gap вручную), Liberators против Oppressors, оба играют Agenda. */
function domSetup(extra: { attempt?: [boolean, boolean]; upgrades?: Body[] } = {}): Body[] {
  const [a1, a2] = extra.attempt ?? [true, true];
  const [, p1, p2, reveal, ...rest] = base;
  return [
    created,
    p1!,
    p2!,
    { type: 'dom-location-set', phase: 1, locationId: 'mannheim-gap', source: 'manual' },
    { type: 'dom-player-set', target: 'p1', patch: { alliance: 'liberators', attempt: a1 } },
    { type: 'dom-player-set', target: 'p2', patch: { alliance: 'oppressors', attempt: a2 } },
    reveal!,
    ...(a1 && a2
      ? ([
          { type: 'dom-player-set', target: 'p1', patch: { agenda: 'dom-planetfall' } },
          { type: 'dom-player-set', target: 'p2', patch: { agenda: 'dom-dig-in' } },
        ] as Body[])
      : []),
    ...(extra.upgrades ?? []),
    ...rest,
  ] as Body[];
}
const run = (bodies: Body[]) => replay(rawLog(...bodies), catalog);

describe('Dominatus: подготовка', () => {
  test('обычная игра без поля mode — как раньше', () => {
    const r = replay(rawLog(...base), catalog);
    expect(r.ok && r.state.mode).toBe('standard');
    expect(r.ok && r.state.dominatus).toBeNull();
  });

  test('без фазы, локации и альянсов битву не начать; одинаковый альянс — нельзя', () => {
    const [, p1, p2, reveal] = base;
    const r = run([created, p1!, p2!, { type: 'dom-player-set', target: 'p1', patch: { alliance: 'raiders' } }, { type: 'dom-player-set', target: 'p2', patch: { alliance: 'raiders' } }, reveal!]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const miss = setupMissing(r.state);
    expect(miss).toContain('фаза кампании и локация');
    expect(miss).toContain('игроки должны быть из разных альянсов');
    expect(miss.some((m) => m.includes('играть ли Agenda'))).toBe(true);
  });

  test('локация по D6 из seed; чужая локация или неверный бросок — отказ', () => {
    const roll = rollD6('seed-1', 'location-2', 0);
    const loc = dom.locations.find((l: { phase: number; rolls: number[] }) => l.phase === 2 && roll >= l.rolls[0] && roll <= l.rolls[1]);
    const ok = run([created, { type: 'dom-location-set', phase: 2, locationId: loc.id, source: 'random', roll: { attempt: 0 } }]);
    expect(ok.ok && ok.state.dominatus!.locationRoll).toBe(roll);
    const wrong = dom.locations.find((l: { phase: number; id: string }) => l.phase === 2 && l.id !== loc.id);
    expect(run([created, { type: 'dom-location-set', phase: 2, locationId: wrong.id, source: 'random', roll: { attempt: 0 } }]).ok).toBe(false);
    expect(run([created, { type: 'dom-location-set', phase: 1, locationId: 'titangrave', source: 'manual' }]).ok).toBe(false);
  });

  test('Agenda: только своего альянса и фазы, после раскрытия типов армий', () => {
    const [, p1, p2, reveal] = base;
    const head: Body[] = [created, p1!, p2!, { type: 'dom-location-set', phase: 1, locationId: 'mannheim-gap', source: 'manual' }, { type: 'dom-player-set', target: 'p1', patch: { alliance: 'liberators', attempt: true } }];
    expect(run([...head, { type: 'dom-player-set', target: 'p1', patch: { agenda: 'dom-planetfall' } }]).ok).toBe(false); // до раскрытия
    expect(run([...head, reveal!, { type: 'dom-player-set', target: 'p1', patch: { agenda: 'dom-dig-in' } }]).ok).toBe(false); // чужой альянс
    expect(run([...head, reveal!, { type: 'dom-player-set', target: 'p1', patch: { agenda: 'dom-rescue-survivors' } }]).ok).toBe(false); // фаза 2
    expect(run([...head, reveal!, { type: 'dom-player-set', target: 'p1', patch: { agenda: 'dom-planetfall' } }]).ok).toBe(true);
  });

  test('оба играют Agenda — она основная миссия; кто-то отказался — основные миссии колоды', () => {
    const both = run(domSetup());
    expect(both.ok).toBe(true);
    if (both.ok) expect(both.state.primary).toEqual({ p1: 'dom-planetfall', p2: 'dom-dig-in' });
    const declined = run(domSetup({ attempt: [true, false] }));
    expect(declined.ok).toBe(true);
    if (declined.ok) expect(declined.state.primary.p1?.startsWith('dom-')).toBe(false);
  });

  test('улучшения: не больше 3, без повторов карт и отрядов, только карты колоды', () => {
    const up = (list: { card: string; unit: string }[]) => [{ type: 'dom-player-set', target: 'p1', patch: { upgrades: list } }] as Body[];
    expect(run(domSetup({ upgrades: up([{ card: 'Kingslayer', unit: 'Капитан' }, { card: 'Born Survivor', unit: 'Интерцессоры' }]) })).ok).toBe(true);
    expect(run(domSetup({ upgrades: up([{ card: 'Kingslayer', unit: 'A' }, { card: 'Born Survivor', unit: 'B' }, { card: 'High Strategy', unit: 'C' }, { card: 'Grim Veterans', unit: 'D' }]) })).ok).toBe(false);
    expect(run(domSetup({ upgrades: up([{ card: 'Kingslayer', unit: 'A' }, { card: 'Kingslayer', unit: 'B' }]) })).ok).toBe(false);
    expect(run(domSetup({ upgrades: up([{ card: 'Kingslayer', unit: 'A' }, { card: 'Born Survivor', unit: 'A' }]) })).ok).toBe(false);
    expect(run(domSetup({ upgrades: up([{ card: 'Excalibur', unit: 'A' }]) })).ok).toBe(false);
  });
});

describe('Dominatus: битва и награды', () => {
  test('Agenda засчитывается как основная миссия (Dig In: 3 ПО за уничтожение в конце своего хода)', () => {
    // p2 ходит первым: фаза командования, затем конец хода — блок «любой раунд, конец вашего хода»
    const r = run([...domSetup(), { type: 'command-phase-started' }, { type: 'command-phase-ended' }, { type: 'primary-scored', target: 'p2', picks: [{ block: 0, row: 0, count: 1 }] }]);
    if (!r.ok) throw new Error(r.error);
    expect(r.state.players.p2.primaryScored.at(-1)!.vp).toBe(3);
  });

  test('итог: победитель тянет Battle Honour фазы, проигравший — Skill; Agenda Achieved даёт ещё одну карту на выбор', () => {
    const end: Body[] = [
      ...domSetup(),
      { type: 'vp-adjusted', target: 'p1', kind: 'primary', delta: 10, note: 'тест' },
      { type: 'battle-ended', reason: 'manual' },
    ];
    // vp-adjusted разрешён во время битвы — переносим его после начала
    const bodies = end.filter((b) => b.type !== 'vp-adjusted');
    const idx = bodies.findIndex((b) => b.type === 'battle-started');
    bodies.splice(idx + 1, 0, end.find((b) => b.type === 'vp-adjusted')!);
    bodies.push({ type: 'dom-achieved', target: 'p1', cards: 1 } as Body);
    const r = run(bodies);
    if (!r.ok) throw new Error(r.error);
    const rw = dominatusRewards(r.state, catalog)!;
    expect(rw.p1.outcome).toBe('win');
    expect(rw.p1.reward).toEqual({ kind: 'honour', draw: 2, keep: 1, phase: 1 });
    expect(rw.p2.reward).toEqual({ kind: 'skill', draw: 1, keep: 1, phase: 1 });
    expect(rw.p1.agenda).toBe('dom-planetfall');
  });

  test('Agenda Achieved нельзя отметить, если Agenda не играли', () => {
    const bodies = [...domSetup({ attempt: [false, false] }), { type: 'battle-ended', reason: 'manual' }, { type: 'dom-achieved', target: 'p1', cards: 1 }] as Body[];
    expect(run(bodies).ok).toBe(false);
  });
});

describe('Dominatus: «конец раунда»', () => {
  test('засчитывается только после фаз хода второго игрока', async () => {
    const { primaryAtOk } = await import('../../../client/src/features/roster/game/scoring');
    expect(primaryAtOk('round-end', { end: false, step: 'main', ownTurn: true, round: 2, lastTurnOfRound: true })).toBe(true);
    expect(primaryAtOk('round-end', { end: false, step: 'main', ownTurn: false, round: 2, lastTurnOfRound: true })).toBe(true);
    expect(primaryAtOk('round-end', { end: false, step: 'main', ownTurn: true, round: 2, lastTurnOfRound: false })).toBe(false);
    expect(primaryAtOk('round-end', { end: false, step: 'command', ownTurn: true, round: 2, lastTurnOfRound: true })).toBe(false);
  });
});

// DM3 (31.10.2026): игра Dominatus на двух телефонах — событие с seat (чей телефон) меняет только свои данные.
describe('Dominatus: два телефона', () => {
  test('локация — общее событие; альянс, Agenda, улучшения, Agenda Achieved — только свои', async () => {
    const { seatForEvent } = await import('../../../client/src/features/roster/game/online');
    expect(seatForEvent('dom-location-set', 'p2')).toBeNull();
    expect(seatForEvent('dom-player-set', 'p2')).toBe('p2');
    expect(seatForEvent('dom-achieved', 'p1')).toBe('p1');

    const [, p1, p2] = base;
    const head: Body[] = [created, p1!, p2!];
    expect(run([...head, { type: 'dom-location-set', phase: 1, locationId: 'mannheim-gap', source: 'manual', seat: 'p1' } as Body]).ok).toBe(false);
    expect(run([...head, { type: 'dom-player-set', target: 'p2', patch: { alliance: 'raiders' }, seat: 'p1' } as Body]).ok).toBe(false);
    expect(run([...head, { type: 'dom-player-set', target: 'p2', patch: { alliance: 'raiders' }, seat: 'p2' } as Body]).ok).toBe(true);
  });

  test('Agenda Achieved второго игрока отмечает только его телефон', () => {
    const bodies = [...domSetup(), { type: 'battle-ended', reason: 'manual' }] as Body[];
    expect(run([...bodies, { type: 'dom-achieved', target: 'p2', cards: 1, seat: 'p1' } as Body]).ok).toBe(false);
    const r = run([...bodies, { type: 'dom-achieved', target: 'p2', cards: 1, seat: 'p2' } as Body]);
    if (!r.ok) throw new Error(r.error);
    expect(r.state.dominatus!.players.p2.achieved).toBe(1);
  });

});
