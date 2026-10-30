/**
 * Ростер Kill Team (W3 30.10.2026): команда, оперативники с выбранным оружием, снаряжение команды.
 * Проверки — только то, что надёжно следует из данных ktdash: лидер (ключевое слово LEADER) и численность по тексту
 * состава, если он однозначен (строки «- N … operative(s)» без вариантов «Or» / «- up to» на верхнем уровне). Остальное правило состава — текст
 * источника на экране; лимит снаряжения в источнике не записан — не проверяется (ничего не придумываем).
 */
import { uid } from '../engine/roster';
import type { KtIndex, KtOperative, KtTeam } from './types';

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

/** Численность команды по тексту состава, если он однозначен; иначе null. */
export function compositionTotal(text: string): number | null {
  if (/^or\b/im.test(text) || /^- up to/im.test(text)) return null;
  const top = [...text.matchAll(/^- (\d+) [^\n]*operatives?\b/gm)].map((m) => Number(m[1]));
  return top.length ? top.reduce((a, b) => a + b, 0) : null;
}

export type KtIssue = { level: 'error' | 'warning'; message: string };
export function checkKtRoster(r: KtRoster, team: KtTeam): KtIssue[] {
  const out: KtIssue[] = [];
  const byId = new Map(team.operatives.map((o) => [o.id, o]));
  const ops = r.operatives.map((x) => ({ x, o: byId.get(x.opTypeId) }));
  for (const { x, o } of ops) if (!o) out.push({ level: 'error', message: `Оперативника ${x.opTypeId} нет в данных команды — удалите его` });
  const known = ops.filter((p) => p.o);
  // пустая команда — не «OK» (UI-аудит B1)
  if (!r.operatives.length) out.push({ level: 'warning', message: 'В команде нет оперативников — добавьте лидера и остальных' });
  if (team.operatives.some((o) => o.keywords.includes('LEADER'))) {
    const leaders = known.filter((p) => p.o!.keywords.includes('LEADER')).length;
    if (leaders === 0 && known.length) out.push({ level: 'error', message: 'Нет лидера (оперативник с ключевым словом LEADER)' });
    if (leaders > 1) out.push({ level: 'error', message: `Лидеров ${leaders} — нужен один` });
  }
  const total = compositionTotal(team.composition);
  if (total != null && known.length !== total) out.push({ level: 'warning', message: `По составу команды — ${total} оперативников, выбрано ${known.length}` });
  for (const { x, o } of known) {
    const ws = x.weapons.filter((id) => o!.weapons.some((w) => w.id === id));
    if (!ws.length && o!.weapons.length) out.push({ level: 'warning', message: `${x.name || o!.name}: не выбрано оружие` });
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
