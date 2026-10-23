// Общие помощники тестов игры (G1.3+): каталог из настоящих данных, журнал по порядку, стандартная подготовка.
import fs from 'node:fs';
import path from 'node:path';
import { commandPhasePending, nextDraw } from '../../../client/src/features/roster/game/decks';
import { replay } from '../../../client/src/features/roster/game/reducer';
import type { GameCatalog, GameEvent, Seat } from '../../../client/src/features/roster/game/types';

const DATA = path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data');
const missions = JSON.parse(fs.readFileSync(path.join(DATA, 'missions.json'), 'utf8'));
const bf = JSON.parse(fs.readFileSync(path.join(DATA, 'battlefield.json'), 'utf8'));
export const catalog: GameCatalog = { cards: missions.cards, caps: missions.caps, matchups: bf.matchups, layouts: bf.layouts };

export type Body = Omit<GameEvent, 'id' | 'seq' | 'at' | 'seat'> & { seat?: Seat | null };
/** Журнал с номерами и id по порядку, как есть (без автоматического взятия карт). */
export function rawLog(...bodies: Body[]): GameEvent[] {
  return bodies.map((b, i) => ({ seat: null, ...b, id: `e${i + 1}`, seq: i + 1, at: `2026-10-23T12:00:${String(i).padStart(2, '0')}Z` }) as GameEvent);
}
/**
 * Журнал с номерами и id. Перед каждым «Завершить фазу командования», где тактический игрок ещё не взял карты
 * (с G3.3 это обязательно), добавляет взятие с верха колоды и обязательную замену «при взятии» — так тесты,
 * которые просто проходят ходы, не перечисляют карты. Тесты самого взятия используют rawLog.
 */
export function log(...bodies: Body[]): GameEvent[] {
  const out: Body[] = [];
  for (const b of bodies) {
    if (b.type === 'command-phase-ended') {
      for (let guard = 0; guard < 6; guard++) {
        const r = replay(rawLog(...out), catalog);
        if (!r.ok) break;
        const s = r.state;
        const seat = s.activeSeat;
        if (!seat || s.step !== 'command' || !commandPhasePending(s, seat, catalog)) break;
        const top = nextDraw(s, seat);
        if (top.length) out.push({ type: 'cards-drawn', target: seat, cards: top, source: 'random' } as Body);
        else {
          const req = s.players[seat].active.find((a) => catalog.cards.find((c) => c.id === a.id)?.onDraw?.required && a.round === s.round);
          if (!req) break;
          out.push({ type: 'card-redrawn', target: seat, card: req.id, replacement: s.players[seat].deck[0], reason: 'when-drawn', shuffleBack: true, source: 'random' } as Body);
        }
      }
    }
    out.push(b);
  }
  return rawLog(...out);
}
export const created: Body = { type: 'game-created', schema: 1, seed: 'seed-1', names: { p1: 'Аня', p2: 'Борис' } } as Body;

/** Подготовка (порядок правил): Take and Hold против Purge the Foe, раскладка A, p1 — атакующий, p2 ходит первым. */
export function setupBodies(): Body[] {
  const pair = ['purge-the-foe', 'take-and-hold'].join('|');
  const layout = bf.layouts.filter((l: { pair: string[] }) => l.pair.join('|') === pair).sort((a: { variant: number }, b: { variant: number }) => a.variant - b.variant)[0];
  return [
    created,
    { type: 'player-set', target: 'p1', patch: { disposition: 'take-and-hold', roster: { source: 'own', rosterId: 'r1', name: 'Мои ультрамарины', factionId: 'SM', points: 2000 } } },
    { type: 'player-set', target: 'p2', patch: { disposition: 'purge-the-foe' } },
    { type: 'dispositions-revealed' },
    { type: 'layout-set', layoutId: layout.id, source: 'manual' },
    { type: 'roles-set', attacker: 'p1', source: 'manual' },
    { type: 'secondary-chosen', target: 'p1', mode: 'tactical', fixed: null },
    { type: 'secondary-chosen', target: 'p2', mode: 'fixed', fixed: ['assassination', 'bring-it-down'] },
    { type: 'secondaries-revealed' },
    { type: 'first-turn-set', first: 'p2', source: 'manual' },
    { type: 'battle-started' },
  ] as Body[];
}
