// Общие помощники тестов игры (G1.3+): каталог из настоящих данных, журнал по порядку, стандартная подготовка.
import fs from 'node:fs';
import path from 'node:path';
import type { GameCatalog, GameEvent, Seat } from '../../../client/src/features/roster/game/types';

const DATA = path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data');
const missions = JSON.parse(fs.readFileSync(path.join(DATA, 'missions.json'), 'utf8'));
const bf = JSON.parse(fs.readFileSync(path.join(DATA, 'battlefield.json'), 'utf8'));
export const catalog: GameCatalog = { cards: missions.cards, caps: missions.caps, matchups: bf.matchups, layouts: bf.layouts };

export type Body = Omit<GameEvent, 'id' | 'seq' | 'at' | 'seat'> & { seat?: Seat | null };
/** Журнал с номерами и id по порядку. */
export function log(...bodies: Body[]): GameEvent[] {
  return bodies.map((b, i) => ({ seat: null, ...b, id: `e${i + 1}`, seq: i + 1, at: `2026-10-23T12:00:${String(i).padStart(2, '0')}Z` }) as GameEvent);
}
export const created: Body = { type: 'game-created', schema: 1, seed: 'seed-1', names: { p1: 'Аня', p2: 'Борис' } } as Body;

/** Подготовка: Take and Hold против Purge the Foe, раскладка A, p1 — атакующий, p2 ходит первым. */
export function setupBodies(): Body[] {
  const pair = ['purge-the-foe', 'take-and-hold'].join('|');
  const layout = bf.layouts.filter((l: { pair: string[] }) => l.pair.join('|') === pair).sort((a: { variant: number }, b: { variant: number }) => a.variant - b.variant)[0];
  return [
    created,
    { type: 'player-set', target: 'p1', patch: { disposition: 'take-and-hold', roster: { source: 'own', rosterId: 'r1', name: 'Мои ультрамарины', factionId: 'SM', points: 2000 } } },
    { type: 'player-set', target: 'p2', patch: { disposition: 'purge-the-foe' } },
    { type: 'secondary-chosen', target: 'p1', mode: 'tactical', fixed: null },
    { type: 'secondary-chosen', target: 'p2', mode: 'fixed', fixed: ['assassination', 'bring-it-down'] },
    { type: 'choices-revealed' },
    { type: 'layout-set', layoutId: layout.id, source: 'random' },
    { type: 'roles-set', attacker: 'p1', source: 'random' },
    { type: 'first-turn-set', first: 'p2', source: 'random' },
    { type: 'battle-started' },
  ] as Body[];
}
