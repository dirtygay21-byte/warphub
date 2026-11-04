/**
 * Варбанда Warcry (W5 30.10.2026). Данные — warcry_data (backend/roster-data/warcry); правила построения — warcrier.net:
 *  - docs/warbands: 3–15 бойцов, ≤1000 очков, у всех рунмарка фракции (кроме союзников, траллов и монстров),
 *    первый боец — герой и лидер, ≤3 героев; группы Dagger/Shield/Hammer — как можно ровнее;
 *  - docs/rules/allies-thralls-and-monsters: союзник — Hero или Ally другой фракции того же Великого альянса, ≤2, герои-союзники
 *    входят в лимит 3 героев, союзник не может быть лидером; тралл — Thrall того же альянса, ≤3; монстр — Monster того же альянса, 1,
 *    монстр один в своей группе, остальные ровно по двум другим;
 *  - docs/rules/bladeborn: боец Bladeborn — не больше одного раза; герой-Bladeborn союзником открывает бойцов с той же рунмаркой
 *    Bladeborn как союзников вне лимита 2;
 *  - страницы фракций: Questor Soulsworn «Heroes All» — нет лимита героев с рунмаркой фракции, но ≤2 героев других фракций
 *    (в данных — флаг heroes_all); Gladiatorium — каждый боец один раз, нет лимита героев, если в варбанде
 *    (кроме союзников) только бойцы Gladiatorium (в данных — флаги singleton / heroes_all подфракции).
 *  - Конфликт: Blacktalons — warcrier «каждый боец с рунмаркой Blacktalons — один раз», в warcry_data singleton=false
 *    (и heroes_all=true, но герой у них один — на проверку не влияет); Gladiatorium (подфракция Thunderstrike) — warcrier
 *    «каждый боец один раз», в warcry_data singleton=false. Берётся warcrier: SINGLETON_OVERRIDES.
 * Чего нет в данных и правилах — не проверяется.
 */
import { uid } from '../engine/roster';
import type { WarcryAbility, WarcryFaction, WarcryFighter } from './types';

export type WarcryRole = 'warband' | 'ally' | 'thrall' | 'monster';
export type WarcryGroup = 'dagger' | 'shield' | 'hammer';
export const WARCRY_GROUPS: WarcryGroup[] = ['dagger', 'shield', 'hammer'];
/** «Каждый боец один раз» по страницам warcrier, где флаг singleton в warcry_data не стоит: id фракции или «id|подфракция». */
export const SINGLETON_OVERRIDES = new Set(['blacktalons', 'stormcast-eternals-thunderstrike-stormcast|Gladitorium']);
export const WARCRY_LIMITS = { minFighters: 3, maxFighters: 15, points: 1000, heroes: 3, allies: 2, thralls: 3, monsters: 1, heroesAllOther: 2 } as const;

export interface WarcryRosterFighter {
  uid: string;
  /** id файла данных бойца: своя фракция, общий файл альянса или другая фракция альянса */
  factionId: string;
  fighterId: string;
  role: WarcryRole;
  /** своё имя бойца (необязательно) */
  name: string;
  group: WarcryGroup | null;
}
export interface WarcryRoster {
  system: 'warcry';
  id: string;
  name: string;
  factionId: string;
  /** порядок важен: первый боец — лидер */
  fighters: WarcryRosterFighter[];
  /** версия данных (коммит warcry_data), с которой собрана */
  dataVersion: string | null;
  summary?: { fighters: number; points: number; errors: number; warnings: number };
  createdAt: number;
  updatedAt: number;
}

export function newWarcryRoster(f: WarcryFaction, dataVersion: string | null): WarcryRoster {
  const now = Date.now();
  return { system: 'warcry', id: uid(), name: f.name, factionId: f.id, fighters: [], dataVersion, createdAt: now, updatedAt: now };
}
export const touchWarcry = (r: WarcryRoster): WarcryRoster => ({ ...r, updatedAt: Date.now() });
export function addFighter(r: WarcryRoster, factionId: string, f: WarcryFighter, role: WarcryRole): WarcryRoster {
  return touchWarcry({ ...r, fighters: [...r.fighters, { uid: uid(), factionId, fighterId: f.id, role, name: '', group: null }] });
}
export const removeFighter = (r: WarcryRoster, u: string): WarcryRoster => touchWarcry({ ...r, fighters: r.fighters.filter((x) => x.uid !== u) });
export const updateFighter = (r: WarcryRoster, u: string, patch: Partial<Pick<WarcryRosterFighter, 'name' | 'group'>>): WarcryRoster =>
  touchWarcry({ ...r, fighters: r.fighters.map((x) => (x.uid === u ? { ...x, ...patch } : x)) });
/** Лидер — первый боец варбанды. */
export function makeLeader(r: WarcryRoster, u: string): WarcryRoster {
  const x = r.fighters.find((f) => f.uid === u);
  return x ? touchWarcry({ ...r, fighters: [x, ...r.fighters.filter((f) => f.uid !== u)] }) : r;
}

/** Файлы данных, нужные варбанде: фракции бойцов (своя, общий файл альянса, фракции союзников). */
export const neededFactions = (r: WarcryRoster) => [...new Set([r.factionId, ...r.fighters.map((x) => x.factionId)])];
type Data = Map<string, WarcryFaction>;
export const fighterOf = (data: Data, x: Pick<WarcryRosterFighter, 'factionId' | 'fighterId'>) => data.get(x.factionId)?.fighters.find((f) => f.id === x.fighterId);
const has = (f: WarcryFighter, rm: string) => f.runemarks.includes(rm);
const subOf = (data: Data, factionId: string, f: WarcryFighter) => (f.subfaction ? data.get(factionId)?.subfactions.find((s) => s.name === f.subfaction) : undefined);

/** Кем боец может войти в варбанду фракции own (пусто — не может). Свои бойцы — только 'warband'. */
export function rolesFor(own: WarcryFaction, src: WarcryFaction, f: WarcryFighter): WarcryRole[] {
  if (src.id === own.id) return ['warband'];
  if (src.grandAlliance !== own.grandAlliance) return [];
  const out: WarcryRole[] = [];
  if (has(f, 'hero') || has(f, 'ally')) out.push('ally');
  if (has(f, 'thrall')) out.push('thrall');
  if (has(f, 'monster')) out.push('monster');
  return out;
}

/** Способности бойца: способности его фракции (и его подфракции) с рунмарками, которые все есть у бойца; монстру — его собственные. */
export function abilitiesFor(src: WarcryFaction | undefined, f: WarcryFighter): WarcryAbility[] {
  if (!src) return [];
  return src.abilities.filter((a) => {
    if (a.cost === 'battletrait') return false;
    if (a.monster) return a.monster === f.name;
    if (a.subfaction && a.subfaction !== f.subfaction) return false;
    return a.runemarks.every((rm) => has(f, rm));
  });
}
/** Универсальные способности, доступные бойцу (монстры их не используют — у них свои с рунмаркой monster). */
export function universalFor(list: WarcryAbility[], f: WarcryFighter): WarcryAbility[] {
  const monster = has(f, 'monster');
  return list.filter((a) => (monster ? a.runemarks.includes('monster') : !a.runemarks.includes('monster') && a.runemarks.every((rm) => has(f, rm))));
}

export const warcryPoints = (r: WarcryRoster, data: Data) => r.fighters.reduce((s, x) => s + (fighterOf(data, x)?.points ?? 0), 0);

/** Раскладка по группам: монстр один в группе, остальные как можно ровнее (по порядку бойцов). */
export function autoGroups(r: WarcryRoster): WarcryRoster {
  const monster = r.fighters.find((x) => x.role === 'monster');
  const groups: WarcryGroup[] = monster ? ['dagger', 'shield'] : WARCRY_GROUPS;
  let i = 0;
  const fighters = r.fighters.map((x) => (x === monster ? { ...x, group: 'hammer' as const } : { ...x, group: groups[i++ % groups.length] }));
  return touchWarcry({ ...r, fighters });
}

export type WarcryIssue = { level: 'error' | 'warning'; message: string; uids?: string[] };
export function checkWarcryRoster(r: WarcryRoster, data: Data): WarcryIssue[] {
  const out: WarcryIssue[] = [];
  const L = WARCRY_LIMITS;
  const own = data.get(r.factionId);
  if (!own) return [{ level: 'error', message: `Фракции ${r.factionId} нет в данных` }];
  const list = r.fighters.map((x) => ({ x, f: fighterOf(data, x), src: data.get(x.factionId) }));
  for (const { x, f } of list) if (!f) out.push({ level: 'error', message: `Бойца ${x.fighterId} нет в данных — удалите его`, uids: [x.uid] });
  const known = list.filter((p): p is typeof p & { f: WarcryFighter; src: WarcryFaction } => !!p.f && !!p.src);
  const name = (p: (typeof known)[number]) => p.x.name || p.f.name;

  if (r.fighters.length < L.minFighters || r.fighters.length > L.maxFighters) out.push({ level: 'error', message: `Бойцов ${r.fighters.length} — нужно от ${L.minFighters} до ${L.maxFighters}` });
  const pts = warcryPoints(r, data);
  if (pts > L.points) out.push({ level: 'error', message: `Очков ${pts} — больше ${L.points}` });
  for (const p of known) {
    const roles = rolesFor(own, p.src, p.f);
    if (!roles.includes(p.x.role)) out.push({ level: 'error', message: `${name(p)}: не может быть в варбанде как ${ROLE_LABEL[p.x.role].toLowerCase()}`, uids: [p.x.uid] });
  }

  // лидер — первый боец: герой и не союзник
  const lead = known[0];
  if (lead && known.length === r.fighters.length && (!has(lead.f, 'hero') || lead.x.role !== 'warband'))
    out.push({ level: 'error', message: 'Лидер (первый боец) должен быть героем своей фракции, не союзником', uids: [lead.x.uid] });

  // герои: обычный лимит 3; «Heroes All» фракции — без лимита для своих, ≤2 героев других фракций;
  // «Heroes All» подфракции — без лимита, если все бойцы (кроме союзников) из этой подфракции
  const heroes = known.filter((p) => has(p.f, 'hero'));
  const nonAllies = known.filter((p) => p.x.role !== 'ally');
  const subAll = own.subfactions.find((s) => s.heroesAll && nonAllies.length > 0 && nonAllies.every((p) => p.src.id === own.id && p.f.subfaction === s.name));
  if (own.heroesAll) {
    const other = heroes.filter((p) => p.src.id !== own.id).length;
    if (other > L.heroesAllOther) out.push({ level: 'error', message: `Героев других фракций ${other} — у «${own.name}» не больше ${L.heroesAllOther}` });
  } else if (!subAll && heroes.length > L.heroes) out.push({ level: 'error', message: `Героев ${heroes.length} — не больше ${L.heroes}` });

  // союзники, траллы, монстры; Bladeborn-спутники героя-союзника — вне лимита союзников
  const allies = known.filter((p) => p.x.role === 'ally');
  const bbHeroes = new Set(allies.filter((p) => has(p.f, 'hero') && subOf(data, p.src.id, p.f)?.bladeborn).map((p) => `${p.src.id}|${p.f.subfaction}`));
  const companion = (p: (typeof known)[number]) => !has(p.f, 'hero') && !!p.f.subfaction && bbHeroes.has(`${p.src.id}|${p.f.subfaction}`);
  const counted = allies.filter((p) => !companion(p)).length;
  if (counted > L.allies) out.push({ level: 'error', message: `Союзников ${counted} — не больше ${L.allies}` });
  const thralls = known.filter((p) => p.x.role === 'thrall').length;
  if (thralls > L.thralls) out.push({ level: 'error', message: `Траллов ${thralls} — не больше ${L.thralls}` });
  const monsters = known.filter((p) => p.x.role === 'monster');
  if (monsters.length > L.monsters) out.push({ level: 'error', message: `Монстров ${monsters.length} — не больше ${L.monsters}` });

  // один раз: Bladeborn-бойцы и бойцы подфракций «по одному» (singleton)
  const seen = new Map<string, number>();
  for (const p of known) {
    const s = subOf(data, p.src.id, p.f);
    if (s?.bladeborn || s?.singleton || p.src.singleton || SINGLETON_OVERRIDES.has(p.src.id) || SINGLETON_OVERRIDES.has(`${p.src.id}|${p.f.subfaction}`)) seen.set(`${p.src.id}|${p.f.id}`, (seen.get(`${p.src.id}|${p.f.id}`) ?? 0) + 1);
  }
  for (const [k, n] of seen)
    if (n > 1) {
      const p = known.find((q) => `${q.src.id}|${q.f.id}` === k)!;
      out.push({ level: 'error', message: `${p.f.name}: можно взять только один раз`, uids: known.filter((q) => `${q.src.id}|${q.f.id}` === k).map((q) => q.x.uid) });
    }

  // группы: все распределены; монстр один в группе; остальные — разница не больше 1
  if (known.length) {
    if (r.fighters.some((x) => !x.group)) out.push({ level: 'warning', message: 'Не все бойцы распределены по группам Dagger / Shield / Hammer', uids: r.fighters.filter((x) => !x.group).map((x) => x.uid) });
    else {
      const m = monsters[0];
      const pool = m ? WARCRY_GROUPS.filter((g) => g !== m.x.group) : WARCRY_GROUPS;
      if (m && r.fighters.some((x) => x !== m.x && x.group === m.x.group)) out.push({ level: 'warning', message: 'Монстр должен быть один в своей группе', uids: r.fighters.filter((x) => x.group === m.x.group).map((x) => x.uid) });
      const sizes = pool.map((g) => r.fighters.filter((x) => x.group === g && x !== m?.x).length);
      if (Math.max(...sizes) - Math.min(...sizes) > 1) out.push({ level: 'warning', message: `Группы неровные (${sizes.join(' / ')}) — распределите как можно ровнее` });
    }
  }
  return out;
}

export const ROLE_LABEL: Record<WarcryRole, string> = { warband: 'Боец', ally: 'Союзник', thrall: 'Тралл', monster: 'Монстр' };
export const GROUP_LABEL: Record<WarcryGroup, string> = { dagger: 'Dagger', shield: 'Shield', hammer: 'Hammer' };

// ---------- код варбанды и чистка «чужих» данных ----------
export const WARCRY_CODE_PREFIX = 'WC1.';
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const ID = /^[a-z0-9][a-z0-9-]{0,59}$/;
const ROLES: WarcryRole[] = ['warband', 'ally', 'thrall', 'monster'];

export function sanitizeWarcryRoster(raw: unknown): WarcryRoster | null {
  if (!isObj(raw) || raw.system !== 'warcry' || typeof raw.factionId !== 'string' || !ID.test(raw.factionId)) return null;
  const seen = new Set<string>();
  const fighters = (Array.isArray(raw.fighters) ? raw.fighters : []).slice(0, 30).filter(isObj).flatMap((o) => {
    if (typeof o.fighterId !== 'string' || !ID.test(o.fighterId) || typeof o.factionId !== 'string' || !ID.test(o.factionId)) return [];
    let u = str(o.uid);
    if (!u || seen.has(u)) u = uid();
    seen.add(u);
    const role = ROLES.includes(o.role as WarcryRole) ? (o.role as WarcryRole) : 'warband';
    const group = WARCRY_GROUPS.includes(o.group as WarcryGroup) ? (o.group as WarcryGroup) : null;
    return [{ uid: u, factionId: o.factionId, fighterId: o.fighterId, role, name: str(o.name).slice(0, 40), group }];
  });
  const now = Date.now();
  const s = raw.summary;
  const okSummary = isObj(s) && ['fighters', 'points', 'errors', 'warnings'].every((k) => typeof s[k] === 'number');
  return {
    system: 'warcry',
    id: str(raw.id) || uid(),
    name: str(raw.name).slice(0, 80) || 'Варбанда',
    factionId: raw.factionId,
    fighters,
    dataVersion: str(raw.dataVersion) || null,
    ...(okSummary ? { summary: { fighters: s.fighters as number, points: s.points as number, errors: s.errors as number, warnings: s.warnings as number } } : {}),
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
  };
}

export function encodeWarcryRoster(r: WarcryRoster): string {
  const { summary: _s, ...rest } = r;
  void _s;
  const bytes = new TextEncoder().encode(JSON.stringify({ v: 1, r: rest }));
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return WARCRY_CODE_PREFIX + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeWarcryRoster(code: string, knownFactions?: string[]): WarcryRoster {
  let obj: unknown;
  try {
    const c = code.trim();
    if (!c.startsWith(WARCRY_CODE_PREFIX)) throw new Error('prefix');
    const body = c.slice(WARCRY_CODE_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(body + '='.repeat((4 - (body.length % 4)) % 4));
    obj = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0))));
  } catch {
    throw new Error(`Неверный код варбанды (начинается с ${WARCRY_CODE_PREFIX})`);
  }
  const r = sanitizeWarcryRoster((obj as { r?: unknown } | null)?.r);
  if (!r) throw new Error('Неверный код варбанды');
  if (knownFactions && r.fighters.concat({ factionId: r.factionId } as WarcryRosterFighter).some((x) => !knownFactions.includes(x.factionId))) throw new Error('Фракция не найдена в данных — обновите приложение');
  return { ...r, id: uid(), createdAt: Date.now(), updatedAt: Date.now() };
}
