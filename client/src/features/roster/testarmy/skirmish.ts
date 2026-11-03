import type { KtRoster } from '../kt/roster';
import type { KtTeam } from '../kt/types';
import { fighterOf, type WarcryRoster } from '../warcry/roster';
import type { WarcryFaction } from '../warcry/types';
import { parseBase } from './bases';
import { DEFAULT_ANGLE, DEFAULT_GAP, FOE_PREFIX, type TAUnit } from './state';

function oneModel(uid: string, name: string, baseMm: number | null, points: number, tags: string[], datasheetId: string): TAUnit {
  const base = parseBase(baseMm ? `${baseMm}mm` : '');
  return {
    uid,
    name,
    leaders: [],
    tags,
    datasheetIds: [datasheetId],
    points,
    models: [{ id: `${uid}.0`, profile: name, options: base.options, source: base.source, pick: 0, customMm: null, at: null }],
    formation: 'tight',
    angle: DEFAULT_ANGLE,
    gap: DEFAULT_GAP,
    placed: false,
  };
}

/** Каждый оперативник Kill Team — отдельная модель на столе с базой из datacard KTDash. */
export function buildKtUnits(roster: KtRoster, team: KtTeam, prefix = ''): TAUnit[] {
  return roster.operatives.flatMap((x) => {
    const op = team.operatives.find((o) => o.id === x.opTypeId);
    if (!op) return [];
    const tags = op.keywords.includes('LEADER') ? ['Лидер'] : [];
    return [oneModel(prefix + x.uid, x.name || op.name, op.baseMm, 0, tags, op.id)];
  });
}

/** Каждый боец Warcry — отдельная модель. В warcry_data размера базы нет: игрок задаёт её в Board. */
export function buildWarcryUnits(roster: WarcryRoster, data: Map<string, WarcryFaction>, prefix = ''): TAUnit[] {
  return roster.fighters.flatMap((x, index) => {
    const fighter = fighterOf(data, x);
    if (!fighter) return [];
    const tags = [index === 0 ? 'Лидер' : '', x.role !== 'warband' ? x.role : '', x.group ?? ''].filter(Boolean);
    return [oneModel(prefix + x.uid, x.name || fighter.name, null, fighter.points, tags, fighter.id)];
  });
}

export const skirmishUid = (uid: string) => (uid.startsWith(FOE_PREFIX) ? uid.slice(FOE_PREFIX.length) : uid);
