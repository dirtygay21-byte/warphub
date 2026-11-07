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


/**
 * Правила, действующие на юнит (карточка 40K, 07.11.2026): армейское правило (способности инфолиста типа faction —
 * «Oath of Moment», «Reanimation Protocols») и правила выбранных детачментов — в том числе через присоединённого
 * Leader / телохранителей (groupDetRules; own — правило есть у самого юнита).
 */
export function unitAppliedRules(c: ComputedUnit, cr: ComputedRoster, L: DataLookup, detachmentIds: string[]) {
  const ds = c.ds!;
  const army = ds.abilities.filter((a) => a.type === 'faction').map((a) => ({ kind: 'army' as const, ability: a, name: a.name + (a.param ? ' ' + a.param : ''), text: a.ref ? (L.faction.rules[a.ref]?.text ?? '') : a.text }));
  const members = groupOf(c, cr);
  const det = groupDetRules(members.length ? members : [c], L, detachmentIds).map((r) => ({ kind: 'detachment' as const, ...r, own: r.via.includes(ds.name) }));
  return { army, det };
}
