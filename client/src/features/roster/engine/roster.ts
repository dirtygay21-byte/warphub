import type { BattleSize, Datasheet, Roster, RosterUnit } from './types';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function newRoster(factionId: string, battleSize: BattleSize = 'strike', dataVersion: string | null = null): Roster {
  const now = Date.now();
  return {
    id: uid(),
    name: 'Новый ростер',
    factionId,
    battleSize,
    detachmentIds: [],
    forceDisposition: null,
    chapter: null,
    units: [],
    warlordUid: null,
    showLegends: false,
    dataVersion,
    createdAt: now,
    updatedAt: now,
  };
}

export function newUnit(ds: Datasheet): RosterUnit {
  return {
    uid: uid(),
    datasheetId: ds.id,
    size: ds.costs[0]?.options[0]?.label ?? '',
    addons: {},
    wargear: {},
    enhancementId: null,
    attachedTo: null,
    picks: null,
  };
}

/** Добавить юнит (сразу после последнего юнита того же инфолиста, чтобы копии шли подряд). */
export function addUnit(r: Roster, ds: Datasheet): Roster {
  const u = newUnit(ds);
  const units = [...r.units, u];
  const warlordUid = !r.warlordUid && ds.character && !ds.group.startsWith('ally:') ? u.uid : r.warlordUid;
  return touch({ ...r, units, warlordUid });
}

export function updateUnit(r: Roster, uidv: string, patch: Partial<RosterUnit>): Roster {
  return touch({ ...r, units: r.units.map((u) => (u.uid === uidv ? { ...u, ...patch } : u)) });
}

export function removeUnit(r: Roster, uidv: string): Roster {
  return touch({
    ...r,
    units: r.units.filter((u) => u.uid !== uidv).map((u) => (u.attachedTo === uidv ? { ...u, attachedTo: null } : u)),
    warlordUid: r.warlordUid === uidv ? null : r.warlordUid,
  });
}

export function duplicateUnit(r: Roster, uidv: string): Roster {
  const i = r.units.findIndex((u) => u.uid === uidv);
  if (i < 0) return r;
  const src = r.units[i];
  const copy: RosterUnit = {
    ...src,
    uid: uid(),
    enhancementId: null,
    attachedTo: null,
    addons: { ...src.addons },
    wargear: { ...src.wargear },
    picks: src.picks ? Object.fromEntries(Object.entries(src.picks).map(([k, v]) => [k, [...v]])) : null,
  };
  const units = [...r.units];
  units.splice(i + 1, 0, copy);
  return touch({ ...r, units });
}

export function duplicateRoster(r: Roster): Roster {
  const map = new Map(r.units.map((u) => [u.uid, uid()]));
  const now = Date.now();
  return {
    ...r,
    id: uid(),
    name: r.name + ' (копия)',
    units: r.units.map((u) => ({ ...u, uid: map.get(u.uid)!, attachedTo: u.attachedTo ? map.get(u.attachedTo) ?? null : null })),
    warlordUid: r.warlordUid ? map.get(r.warlordUid) ?? null : null,
    createdAt: now,
    updatedAt: now,
  };
}

export function touch(r: Roster): Roster {
  return { ...r, updatedAt: Date.now() };
}

// ---------- код для переноса ростера между устройствами ----------
export function encodeRoster(r: Roster): string {
  const json = JSON.stringify({ v: 1, r });
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return 'WH1.' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeRoster(code: string, knownFactions?: string[]): Roster {
  let obj: unknown;
  try {
    const body = code.trim().replace(/^WH1\./, '').replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(body + '='.repeat((4 - (body.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    obj = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('Неверный код ростера');
  }
  const r = sanitizeRoster((obj as { r?: unknown } | null)?.r);
  if (!r) throw new Error('Неверный код ростера');
  if (knownFactions && !knownFactions.includes(r.factionId)) throw new Error('Ростер для неизвестной фракции — обновите данные');
  return { ...r, id: uid(), updatedAt: Date.now() };
}

// ---------- проверка данных извне (код ростера, localStorage, CloudStorage) ----------
const BATTLE_SIZE_IDS: BattleSize[] = ['incursion', 'strike', 'onslaught'];
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, def = ''): string => (typeof v === 'string' ? v : def);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown, def = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : def);
const counts = (v: unknown): Record<string, number> =>
  isObj(v) ? Object.fromEntries(Object.entries(v).filter(([, n]) => typeof n === 'number' && Number.isFinite(n) && n >= 0)) as Record<string, number> : {};

const picksOf = (v: Record<string, unknown>): Record<string, number[]> =>
  Object.fromEntries(
    Object.entries(v)
      .filter(([k, a]) => /^\d+(?:\.\d+)?$/.test(k) && Array.isArray(a))
      .map(([k, a]) => [k, (a as unknown[]).map((n) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0))]),
  );

/**
 * Приводит «чужой» ростер к ожидаемой форме: лишние поля отбрасываются, недостающие получают значения
 * по умолчанию. null — если это вообще не ростер. Так битый код или старая запись не роняют раздел.
 */
export function sanitizeRoster(raw: unknown): Roster | null {
  if (!isObj(raw) || typeof raw.factionId !== 'string' || !raw.factionId || !Array.isArray(raw.units)) return null;
  const units: RosterUnit[] = raw.units.filter(isObj).flatMap((u) =>
    typeof u.datasheetId === 'string' && u.datasheetId
      ? [
          {
            uid: str(u.uid) || uid(),
            datasheetId: u.datasheetId,
            size: str(u.size),
            addons: counts(u.addons),
            wargear: counts(u.wargear),
            weapons: isObj(u.weapons) ? counts(u.weapons) : null,
            picks: isObj(u.picks) ? picksOf(u.picks) : null,
            enhancementId: strOrNull(u.enhancementId),
            attachedTo: strOrNull(u.attachedTo),
          },
        ]
      : [],
  );
  const uids = new Set(units.map((u) => u.uid));
  for (const u of units) if (u.attachedTo && !uids.has(u.attachedTo)) u.attachedTo = null;
  const now = Date.now();
  const s = raw.summary;
  return {
    id: str(raw.id) || uid(),
    name: str(raw.name).slice(0, 80) || 'Ростер',
    factionId: raw.factionId,
    battleSize: BATTLE_SIZE_IDS.includes(raw.battleSize as BattleSize) ? (raw.battleSize as BattleSize) : 'strike',
    detachmentIds: Array.isArray(raw.detachmentIds) ? raw.detachmentIds.filter((x): x is string => typeof x === 'string') : [],
    forceDisposition: strOrNull(raw.forceDisposition),
    chapter: strOrNull(raw.chapter),
    units,
    warlordUid: typeof raw.warlordUid === 'string' && uids.has(raw.warlordUid) ? raw.warlordUid : null,
    showLegends: raw.showLegends === true,
    dataVersion: strOrNull(raw.dataVersion),
    summary: isObj(s) ? { points: num(s.points), errors: num(s.errors), warnings: num(s.warnings) } : undefined,
    createdAt: num(raw.createdAt, now),
    updatedAt: num(raw.updatedAt, now),
  };
}
