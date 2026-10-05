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
  const copy: RosterUnit = { ...src, uid: uid(), enhancementId: null, attachedTo: null, addons: { ...src.addons }, wargear: { ...src.wargear } };
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

export function decodeRoster(code: string): Roster {
  const body = code.trim().replace(/^WH1\./, '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(body + '='.repeat((4 - (body.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const obj = JSON.parse(new TextDecoder().decode(bytes));
  const r = obj.r as Roster;
  if (!r || !Array.isArray(r.units) || !r.factionId) throw new Error('Неверный код ростера');
  return { ...r, id: uid(), updatedAt: Date.now() };
}
