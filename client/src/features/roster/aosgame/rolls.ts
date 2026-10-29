/** Броски AoS по seed игры (одинаковые на любом телефоне и после отмены): батлплан, роли, priority. */
import { makeRng, pickIndex, rollOff } from '../game/rng';
import type { Seat } from './types';

const d6 = (rng: () => number) => pickIndex(rng, 6) + 1;

/** Батлплан: D6 — таблица (1–3 — первая, 4–6 — вторая), D6 — номер в таблице → 1–12. */
export function battleplanRoll(seed: string, attempt: number): { table: 1 | 2; tableDie: number; planDie: number; n: number } {
  const rng = makeRng(seed, 'aos-battleplan', attempt);
  const tableDie = d6(rng);
  const planDie = d6(rng);
  const table = tableDie <= 3 ? 1 : 2;
  return { table, tableDie, planDie, n: (table - 1) * 6 + planDie };
}

/** Атакующий и защитник: бросок «кто выше» (ничья — переброс), победитель решает. */
export const rolesRoll = (seed: string, attempt: number) => rollOff(seed, 'aos-roles', attempt);

/**
 * Priority в начале раунда: по D6 каждому, победитель решает, кто ходит первым. Ничья — решает тот, кто ходил первым в
 * прошлом раунде (Core Rules 12.0); в первом раунде прошлого нет — ничья перебрасывается, как обычный бросок «кто выше».
 */
export function priorityRoll(seed: string, round: number, attempt: number, prevFirst: Seat | null): { p1: number; p2: number; winner: Seat | null; decider: Seat } {
  const rng = makeRng(seed, 'aos-priority', round, attempt);
  for (;;) {
    const p1 = d6(rng);
    const p2 = d6(rng);
    if (p1 !== p2) {
      const w: Seat = p1 > p2 ? 'p1' : 'p2';
      return { p1, p2, winner: w, decider: w };
    }
    if (prevFirst) return { p1, p2, winner: null, decider: prevFirst };
  }
}
