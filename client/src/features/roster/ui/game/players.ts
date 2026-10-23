import type { Roster } from '../../engine/types';
import type { RosterRef } from '../../game';

/** Снимок ростера для игры: подпись и подсказка типа армии (сам ростер в игру не копируется). */
export function rosterRef(r: Roster, source: 'own' | 'code'): RosterRef {
  return {
    source,
    rosterId: source === 'own' ? r.id : undefined,
    name: r.name,
    factionId: r.factionId,
    points: r.summary?.points,
    forceDisposition: r.forceDisposition,
  };
}
