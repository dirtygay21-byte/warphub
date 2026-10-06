import type { ComputedRoster, ComputedUnit, DataLookup } from './compute';

/** Отряд целиком: телохранители + присоединённые Leader/Support — способности по источникам и правила детачмента. */
export function groupOf(c: ComputedUnit, cr: ComputedRoster): ComputedUnit[] {
  const body = c.unit.attachedTo ? cr.byUid.get(c.unit.attachedTo) : c;
  if (!body || !body.attached.length) return [];
  return [body, ...body.attached.map((a) => cr.byUid.get(a.uid)).filter((x): x is ComputedUnit => !!x?.ds)];
}

export const roleOf = (m: ComputedUnit) => (!m.unit.attachedTo ? 'основной отряд' : m.ds!.support ? 'Support' : 'Leader');

export function groupDetRules(members: ComputedUnit[], L: DataLookup, detachmentIds: string[]) {
  const detIds = new Set(detachmentIds);
  const out: { id: string; name: string; text: string; det: string; via: string[] }[] = [];
  for (const d of L.faction.detachments.filter((x) => detIds.has(x.id))) {
    for (const a of d.abilities) {
      const via = members.filter((m) => m.ds!.detachmentAbilities.includes(a.id)).map((m) => m.ds!.name);
      if (via.length) out.push({ id: a.id, name: a.name, text: a.text, det: d.name, via });
    }
  }
  return out;
}

