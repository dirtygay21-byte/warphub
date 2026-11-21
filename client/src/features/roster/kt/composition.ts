/**
 * Состав команды Kill Team по слотам (21.11.2026, решение владельца): правильный счёт оперативников —
 * фиксированные оперативники (лидер, дроны, маркер) входят в численность, «полвыбора» и «за два выбора»,
 * «каждый один раз», лимиты по оружию и группам. Данные — team.structure (tools/roster-data/kt/composition.json).
 */
import type { KtRosterOp } from './roster';
import type { KtOperative, KtStructure, KtTeam } from './types';

const weaponNameNorm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export const structureOf = (team: KtTeam): KtStructure | null => team.structure ?? null;

/** Вес выбора оперативника (по умолчанию 1). */
export const weightOf = (s: KtStructure, opTypeId: string) => s.weights?.[opTypeId] ?? 1;

/** Численность команды: сумма обязательных слотов. */
export const structureTotal = (s: KtStructure) => s.slots.filter((x) => !x.optional).reduce((sum, x) => sum + x.count, 0);

const slotAccepts = (slot: KtStructure['slots'][number], id: string) => slot.ops.includes('*') || slot.ops.includes(id);

export type SlotFill = { label: string; count: number; filled: number; optional: boolean; flexible: boolean };

/**
 * Разложить оперативников ростера по слотам (перебор с возвратом, оперативников ≤ ~16):
 * максимум размещённых, остальные — «лишние».
 */
export function assignSlots(s: KtStructure, ops: Pick<KtRosterOp, 'uid' | 'opTypeId'>[]): { fills: SlotFill[]; extra: string[] } {
  const items = ops
    .map((o) => ({ uid: o.uid, w: weightOf(s, o.opTypeId), cands: s.slots.map((slot, i) => (slotAccepts(slot, o.opTypeId) ? i : -1)).filter((i) => i >= 0) }))
    // сначала самые «узкие»: фиксированные оперативники не должны занимать общий слот
    .sort((a, b) => a.cands.length - b.cands.length);
  // общий слот («*») — последним, конкретные — первыми
  for (const it of items) it.cands.sort((a, b) => Number(s.slots[a]!.ops.includes('*')) - Number(s.slots[b]!.ops.includes('*')) || s.slots[a]!.ops.length - s.slots[b]!.ops.length);
  const left = s.slots.map((x) => x.count);
  const pick: number[] = new Array(items.length).fill(-1);
  let best = { placed: -1, pick: [...pick] };
  let steps = 0;
  const dfs = (i: number, placed: number) => {
    if (++steps > 20000) return;
    if (placed + (items.length - i) <= best.placed) return;
    if (i === items.length) {
      if (placed > best.placed) best = { placed, pick: [...pick] };
      return;
    }
    const it = items[i]!;
    for (const c of it.cands) {
      if (left[c]! + 1e-9 < it.w) continue;
      left[c]! -= it.w;
      pick[i] = c;
      dfs(i + 1, placed + 1);
      left[c]! += it.w;
      pick[i] = -1;
      if (best.placed === items.length) return;
    }
    dfs(i + 1, placed);
  };
  dfs(0, 0);
  const filled = s.slots.map(() => 0);
  const extra: string[] = [];
  items.forEach((it, i) => {
    const c = best.pick[i]!;
    if (c >= 0) filled[c]! += it.w;
    else extra.push(it.uid);
  });
  return {
    fills: s.slots.map((x, i) => ({ label: x.label ?? '', count: x.count, filled: filled[i]!, optional: !!x.optional, flexible: !!x.flexible })),
    extra,
  };
}

/** soft — не мешает добавить оперативника (оружие меняется, нужный напарник добавляется следом) */
export type StructIssue = { level: 'error' | 'warning'; message: string; uids?: string[]; soft?: boolean };

const plural = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'оперативник' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'оперативника' : 'оперативников');
const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ','));

/** Проверки состава по слотам; operativesById — данные команды. */
export function checkStructure(s: KtStructure, team: KtTeam, ops: KtRosterOp[]): StructIssue[] {
  const out: StructIssue[] = [];
  const byId = new Map(team.operatives.map((o) => [o.id, o]));
  const known = ops.filter((x) => byId.has(x.opTypeId));
  const nameOf = (id: string) => byId.get(id)?.name ?? id;
  const countOf = (id: string) => known.filter((x) => x.opTypeId === id).length;

  const { fills, extra } = assignSlots(s, known);
  if (extra.length) out.push({ level: 'error', message: `Лишние оперативники: ${extra.map((u) => nameOf(known.find((x) => x.uid === u)!.opTypeId)).join(', ')} — по составу им нет места`, uids: extra });
  if (known.length) {
    for (const f of fills) {
      // лидер проверяется отдельно (checkKtRoster: «Нет лидера» / «Лидеров N»)
      if (f.optional || f.filled + 1e-9 >= f.count || f.label === 'Лидер') continue;
      const slot = s.slots[fills.indexOf(f)]!;
      const what = f.label || (slot.ops.length <= 3 ? slot.ops.map(nameOf).join(' / ') : 'оперативники из списка');
      const missing = f.count - f.filled;
      out.push({ level: 'warning', message: `Не хватает: ${what} — ещё ${num(missing)}${f.flexible ? ' (или ploy за 0 CP по правилам команды)' : ''}` });
    }
  }

  const repeatable = new Set(s.unique?.except ?? []);
  for (const id of new Set(known.map((x) => x.opTypeId))) {
    const n = countOf(id);
    const max = s.maxPerOp?.[id] ?? (s.unique && !repeatable.has(id) ? 1 : Infinity);
    if (n > max) out.push({ level: 'error', message: `${nameOf(id)}: не больше ${max} (сейчас ${n})`, uids: known.filter((x) => x.opTypeId === id).map((x) => x.uid) });
  }
  for (const g of s.groupMax ?? []) {
    const n = known.filter((x) => g.ops.includes(x.opTypeId)).length;
    if (n > g.max) out.push({ level: 'error', message: `${g.text} (сейчас ${n})` });
  }
  for (const k of s.keywordMax ?? []) {
    const n = known.filter((x) => byId.get(x.opTypeId)!.keywords.includes(k.keyword)).length;
    if (n > k.max) out.push({ level: 'error', message: `${k.text} (сейчас ${n})` });
  }
  for (const wl of s.weaponMax ?? []) {
    const pats = wl.weapons.map(weaponNameNorm);
    const holders = known.filter((x) => {
      const o = byId.get(x.opTypeId)!;
      return x.weapons.some((wid) => {
        const name = weaponNameNorm(o.weapons.find((w) => w.id === wid)?.name ?? '');
        return pats.some((p) => (wl.exact ? name === p : name.includes(p)));
      });
    });
    if (holders.length > wl.max) out.push({ level: 'error', message: `${wl.text} (сейчас ${holders.length})`, uids: holders.map((x) => x.uid), soft: true });
  }
  for (const r of s.requires ?? []) {
    if (countOf(r.op) > 0 && !r.needs.some((id) => countOf(id) > 0)) out.push({ level: 'error', message: r.text, soft: true });
  }
  for (const r of s.requireAny ?? []) {
    if (known.length && !known.some((x) => r.ops.includes(x.opTypeId))) out.push({ level: 'error', message: r.text, soft: true });
  }
  for (const id of s.distinctLoadout ?? []) {
    const copies = known.filter((x) => x.opTypeId === id);
    const seen = new Set<string>();
    for (const x of copies) {
      const key = [...x.weapons].sort().join('+');
      if (seen.has(key)) {
        out.push({ level: 'error', message: `${nameOf(id)}: у каждого — разное оружие`, uids: copies.map((c) => c.uid), soft: true });
        break;
      }
      seen.add(key);
    }
  }
  if (s.oneGroup?.length) {
    const used = s.oneGroup.filter((g) => known.some((x) => x.opTypeId.startsWith(g.prefix)));
    if (used.length > 1) out.push({ level: 'error', message: `Реквизиция — только из одной группы (сейчас: ${used.map((g) => g.name).join(', ')})` });
  }
  return out;
}

/** Можно ли добавить оперативника: null — можно, иначе причина. */
export function addBlockReason(s: KtStructure, team: KtTeam, ops: KtRosterOp[], o: KtOperative): string | null {
  const probe: KtRosterOp = { uid: '__probe__', opTypeId: o.id, name: '', weapons: o.weapons.filter((w) => w.default).map((w) => w.id) };
  const before = new Set(checkStructure(s, team, ops).filter((i) => i.level === 'error').map((i) => i.message.replace(/ \(сейчас \d+\)$/, '')));
  const after = checkStructure(s, team, [...ops, probe]).filter((i) => i.level === 'error' && !i.soft);
  const fresh = after.find((i) => !before.has(i.message.replace(/ \(сейчас \d+\)$/, '')));
  if (!fresh) return null;
  if (fresh.message.startsWith('Лишние')) return 'Все места этого типа заняты';
  return fresh.message.replace(/ \(сейчас \d+\)$/, '');
}

export const operativesWord = plural;
