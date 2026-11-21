/**
 * Ростер Kill Team (W3 30.10.2026): команда, оперативники с выбранным оружием, снаряжение команды.
 * Проверки — только то, что надёжно следует из данных ktdash: лидер (ключевое слово LEADER или оперативник
 * из состава), выборы по тексту состава, включая половины Grot/Bomb Squig, и явные комбинации wargear.
 * Остальные правила состава и снаряжения — текст источника на экране; неоднозначные ограничения не придумываем.
 */
import { uid } from '../engine/roster';
import { checkStructure, structureOf, structureTotal, weightOf } from './composition';
import type { KtIndex, KtOperative, KtTeam, KtWeapon } from './types';

export interface KtRosterOp {
  uid: string;
  opTypeId: string;
  /** своё имя оперативника (необязательно) */
  name: string;
  /** выбранное оружие (id); пусто — оружие по умолчанию */
  weapons: string[];
}
export interface KtRoster {
  system: 'kt';
  id: string;
  name: string;
  teamId: string;
  operatives: KtRosterOp[];
  equipment: string[];
  /** версия данных (коммит ktdash), с которой собран */
  dataVersion: string | null;
  summary?: { operatives: number; errors: number; warnings: number };
  createdAt: number;
  updatedAt: number;
}

/** Подпись команды: группа внутри фракции (Astra Militarum) или фракция ktdash (Imperium). */
export const ktTeamGroup = (index: KtIndex, t: KtIndex['teams'][number]) => t.group ?? index.factions.find((f) => f.id === t.factionId)?.name ?? t.factionId;

export function newKtRoster(team: KtTeam, dataVersion: string | null): KtRoster {
  const now = Date.now();
  return { system: 'kt', id: uid(), name: team.name, teamId: team.id, operatives: [], equipment: [], dataVersion, createdAt: now, updatedAt: now };
}
export const touchKt = (r: KtRoster): KtRoster => ({ ...r, updatedAt: Date.now() });
export const defaultWeapons = (o: KtOperative) => o.weapons.filter((w) => w.default).map((w) => w.id);
export function addOperative(r: KtRoster, o: KtOperative): KtRoster {
  return touchKt({ ...r, operatives: [...r.operatives, { uid: uid(), opTypeId: o.id, name: '', weapons: defaultWeapons(o) }] });
}
export const removeOperative = (r: KtRoster, u: string): KtRoster => touchKt({ ...r, operatives: r.operatives.filter((x) => x.uid !== u) });
export const updateOperative = (r: KtRoster, u: string, patch: Partial<Omit<KtRosterOp, 'uid' | 'opTypeId'>>): KtRoster =>
  touchKt({ ...r, operatives: r.operatives.map((x) => (x.uid === u ? { ...x, ...patch } : x)) });
export const toggleEquipment = (r: KtRoster, id: string): KtRoster =>
  touchKt({ ...r, equipment: r.equipment.includes(id) ? r.equipment.filter((x) => x !== id) : [...r.equipment, id] });

/** Численность команды: по разобранному составу (слоты), иначе — по тексту, если он однозначен. */
export function ktTeamTotal(team: KtTeam): number | null {
  const s = structureOf(team);
  return s ? structureTotal(s) : compositionTotal(team.composition);
}

/** Численность команды по тексту состава, если он однозначен; иначе null. */
export function compositionTotal(text: string): number | null {
  if (/^or\b/im.test(text) || /^- up to/im.test(text)) return null;
  const top = [...text.matchAll(/^- (\d+) [^\n]*operatives?\b/gm)].map((m) => Number(m[1]));
  return top.length ? top.reduce((a, b) => a + b, 0) : null;
}

const norm = (value: string) => value.toLocaleLowerCase('ru').replace(/[^a-zа-я0-9]+/gi, '');
const weaponNorm = (value: string) => norm(value).replace(/klaw/g, 'claw');

/** Explicit keywords win. Fallback is only the single operative named by the first composition bullet. */
export function isLeaderOperative(team: KtTeam, operative: KtOperative): boolean {
  if (team.operatives.some((o) => o.keywords.includes('LEADER'))) return operative.keywords.includes('LEADER');
  const first = team.composition.split('\n').find((line) => line.trim().startsWith('-'));
  if (!first || !/^\s*-\s*1\s+(?!if\b)/i.test(first) || !/operative\b/i.test(first)) return false;
  return norm(first).includes(norm(operative.name));
}

function halfSelectionIds(team: KtTeam): Set<string> {
  const names = [...team.composition.matchAll(/^\s*-\s*([^;\n(]+?)\s*\(X\)\s*$/gm)]
    .map((match) => norm(match[1]!));
  const footnotes = [...team.composition.matchAll(/\*\*\((\d+)\):\*\*\s*These operatives count as half a selection each\./gi)];
  for (const footnote of footnotes) {
    const marker = `\\*\\(${footnote[1]}\\)\\*`;
    const bullet = new RegExp(`^\\s*-\\s*([^;\\n]+?)\\s*${marker}`, 'gm');
    for (const match of team.composition.matchAll(bullet)) names.push(norm(match[1]!.split(/[\r\n]/).pop()!));
  }
  return new Set(team.operatives.filter((o) => names.some((name) => norm(o.name).endsWith(name))).map((o) => o.id));
}

/** Counts selections rather than cards: Grot and Bomb Squig together are one selection. */
export function rosterSelectionCount(r: KtRoster, team: KtTeam): number {
  const s = structureOf(team);
  if (s) return r.operatives.filter((x) => team.operatives.some((o) => o.id === x.opTypeId)).reduce((sum, x) => sum + weightOf(s, x.opTypeId), 0);
  const byId = new Map(team.operatives.map((o) => [o.id, o]));
  const half = halfSelectionIds(team);
  return r.operatives.reduce((sum, op) => {
    const operative = byId.get(op.opTypeId);
    if (!operative) return sum;
    return sum + (half.has(operative.id) ? 0.5 : 1);
  }, 0);
}

/** Explicit wargear combinations from the operative's own composition block, if present. */
export function allowedWeaponCombos(team: KtTeam, operative: KtOperative): string[][] | null {
  const lines = team.composition.split('\n');
  const name = norm(operative.name);
  const start = lines.findIndex((line) => norm(line).includes(name) && /one of the following options/i.test(line));
  if (start < 0) return null;
  // Nested "Or one option from each" branches are not simple pairs/triples; leave them to source text.
  if (lines.slice(start + 1).some((line) => /^\s*Or\b/i.test(line))) return null;
  const combos: string[][] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i]!.trim();
    if (!line.includes(';')) break;
    const names = line.replace(/^-/, '').split(';').map((part) => part.trim());
    const ids = names.map((option) => operative.weapons.find((weapon) => weaponNorm(weapon.name) === weaponNorm(option))?.id);
    if (ids.some((id) => !id)) return null;
    combos.push(ids as string[]);
  }
  return combos.length ? combos : null;
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));
const comboText = (operative: KtOperative, combo: string[]) => combo.map((id) => operative.weapons.find((weapon) => weapon.id === id)?.name ?? id).join(' + ');

/** Allows valid partial selections and switches to the valid pair when a combination would be invalid. */
export function nextWeaponsForToggle(team: KtTeam, operative: KtOperative, current: string[], toggled: KtWeapon): string[] {
  const next = current.includes(toggled.id) ? current.filter((id) => id !== toggled.id) : [...current, toggled.id];
  const combos = allowedWeaponCombos(team, operative);
  if (!combos) return next;
  if (next.length === 0) return next;
  if (combos.some((combo) => combo.some((id) => next.includes(id)) && next.every((id) => combo.includes(id)))) return next;
  const replacement = combos.find((combo) => combo.includes(toggled.id));
  return replacement ?? current;
}

const countText = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');

/** Required operative keywords such as the Sorcerer in Warp Coven — requirements, not leadership. */
export function requiredOperativeKeywords(team: KtTeam): string[] {
  return [...team.composition.matchAll(/must select at least one friendly ([A-Z ]+) operative/gi)]
    .map((match) => match[1]!.trim().toUpperCase());
}

export type KtIssue = { level: 'error' | 'warning'; message: string; uids?: string[] };
export function checkKtRoster(r: KtRoster, team: KtTeam): KtIssue[] {
  const out: KtIssue[] = [];
  const byId = new Map(team.operatives.map((o) => [o.id, o]));
  const ops = r.operatives.map((x) => ({ x, o: byId.get(x.opTypeId) }));
  for (const { x, o } of ops) if (!o) out.push({ level: 'error', message: `Оперативника ${x.opTypeId} нет в данных команды — удалите его`, uids: [x.uid] });
  const known = ops.filter((p) => p.o);
  // пустая команда — не «OK» (UI-аудит B1)
  if (!r.operatives.length) out.push({ level: 'warning', message: 'В команде нет оперативников — добавьте лидера и остальных' });
  if (team.operatives.some((o) => isLeaderOperative(team, o))) {
    const leaders = known.filter((p) => isLeaderOperative(team, p.o!)).length;
    if (leaders === 0 && known.length) out.push({ level: 'error', message: 'Нет лидера команды (см. состав источника)' });
    if (leaders > 1) out.push({ level: 'error', message: `Лидеров ${leaders} — нужен один`, uids: known.filter((p) => isLeaderOperative(team, p.o!)).map((p) => p.x.uid) });
  }
  for (const keyword of requiredOperativeKeywords(team)) {
    if (!known.some((p) => p.o!.keywords.includes(keyword))) out.push({ level: 'error', message: `Обязательный оперативник: ${keyword}` });
  }
  const structure = structureOf(team);
  if (structure) for (const i of checkStructure(structure, team, r.operatives)) out.push({ level: i.level, message: i.message, uids: i.uids });
  const total = structure ? null : compositionTotal(team.composition);
  const selections = rosterSelectionCount(r, team);
  if (total != null && Math.abs(selections - total) > 0.001) out.push({ level: 'warning', message: `По составу команды — ${total} оперативников, выбрано ${countText(selections)} выборов (${known.length} моделей)` });
  for (const { x, o } of known) {
    const unknown = x.weapons.filter((id) => !o!.weapons.some((w) => w.id === id));
    if (unknown.length) out.push({ level: 'error', message: `${x.name || o!.name}: оружие ${unknown.join(', ')} не найдено в данных`, uids: [x.uid] });
    const ws = x.weapons.filter((id) => o!.weapons.some((w) => w.id === id));
    if (!ws.length && o!.weapons.length) out.push({ level: 'warning', message: `${x.name || o!.name}: не выбрано оружие`, uids: [x.uid] });
    const combos = allowedWeaponCombos(team, o!);
    if (ws.length && combos && !combos.some((combo) => sameSet(combo, ws))) {
      out.push({ level: 'error', message: `${x.name || o!.name}: доступные комбинации — ${combos.map((combo) => comboText(o!, combo)).join(' или ')}`, uids: [x.uid] });
    }
  }
  for (const id of r.equipment) if (!team.equipment.some((e) => e.id === id)) out.push({ level: 'error', message: `Снаряжения ${id} нет в данных команды — снимите его` });
  return out;
}

// ---------- код ростера и чистка «чужих» данных ----------
export const KT_CODE_PREFIX = 'KT1.';
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const ID = /^[\w:.-]{1,60}$/;
const ids = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && ID.test(x)).slice(0, max) : []);

export function sanitizeKtRoster(raw: unknown): KtRoster | null {
  if (!isObj(raw) || raw.system !== 'kt' || typeof raw.teamId !== 'string' || !ID.test(raw.teamId)) return null;
  const seen = new Set<string>();
  const operatives = (Array.isArray(raw.operatives) ? raw.operatives : []).slice(0, 30).filter(isObj).flatMap((o) => {
    if (typeof o.opTypeId !== 'string' || !ID.test(o.opTypeId)) return [];
    let u = str(o.uid);
    if (!u || seen.has(u)) u = uid();
    seen.add(u);
    return [{ uid: u, opTypeId: o.opTypeId, name: str(o.name).slice(0, 40), weapons: ids(o.weapons, 12) }];
  });
  const now = Date.now();
  const s = raw.summary;
  return {
    system: 'kt',
    id: str(raw.id) || uid(),
    name: str(raw.name).slice(0, 80) || 'Команда',
    teamId: raw.teamId,
    operatives,
    equipment: ids(raw.equipment, 20),
    dataVersion: str(raw.dataVersion) || null,
    ...(isObj(s) && typeof s.operatives === 'number' && typeof s.errors === 'number' && typeof s.warnings === 'number' ? { summary: { operatives: s.operatives, errors: s.errors, warnings: s.warnings } } : {}),
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
  };
}

export function encodeKtRoster(r: KtRoster): string {
  const { summary: _s, ...rest } = r;
  void _s;
  const bytes = new TextEncoder().encode(JSON.stringify({ v: 1, r: rest }));
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return KT_CODE_PREFIX + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeKtRoster(code: string, knownTeams?: string[]): KtRoster {
  let obj: unknown;
  try {
    const c = code.trim();
    if (!c.startsWith(KT_CODE_PREFIX)) throw new Error('prefix');
    const body = c.slice(KT_CODE_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(body + '='.repeat((4 - (body.length % 4)) % 4));
    obj = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0))));
  } catch {
    throw new Error('Неверный код команды (начинается с KT1.)');
  }
  const r = sanitizeKtRoster((obj as { r?: unknown } | null)?.r);
  if (!r) throw new Error('Неверный код команды');
  if (knownTeams && !knownTeams.includes(r.teamId)) throw new Error('Команда не найдена в данных — обновите приложение');
  return { ...r, id: uid(), createdAt: Date.now(), updatedAt: Date.now() };
}
