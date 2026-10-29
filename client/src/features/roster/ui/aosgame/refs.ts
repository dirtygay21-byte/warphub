import { encodeAosRoster } from '../../aos/roster';
import type { AosIndex, AosRoster } from '../../aos/types';
import type { AosRosterRef } from '../../aosgame';

/** Ссылка на ростер для игры: имя, фракция, очки и число вспомогательных отрядов (для +1 CP). */
export function rosterRefOf(r: AosRoster, source: 'own' | 'code', index: AosIndex): AosRosterRef {
  const faction = index.factions.find((f) => f.id === r.factionId)?.name;
  return {
    source,
    rosterId: source === 'own' ? r.id : undefined,
    name: faction ? `${r.name} · ${faction}` : r.name,
    factionId: r.factionId,
    points: r.summary?.points,
    auxiliaries: r.auxiliaries.length,
    code: source === 'code' ? encodeAosRoster(r) : undefined,
  };
}

export const TIER_LABEL = { affray: 'Affray', strike: 'Strike', domination: 'Domination' } as const;
