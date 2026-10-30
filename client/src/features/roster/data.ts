import { apiRequest } from '@/apiUtils/general';
import type { DataIndex, FactionData } from './engine/types';
import type { AosBattlepack, AosFactionData, AosIndex } from './aos/types';
import type { KtIndex, KtTeam } from './kt/types';

// Данные Wahapedia отдаёт backend (GET /roster/data/:name) — только пользователям с доступом.
let indexPromise: Promise<DataIndex> | null = null;
const factionCache = new Map<string, Promise<FactionData>>();

export function loadIndex(): Promise<DataIndex> {
  indexPromise ??= apiRequest<DataIndex>('/roster/data/index');
  indexPromise.catch(() => (indexPromise = null));
  return indexPromise;
}

export function loadFaction(id: string): Promise<FactionData> {
  if (!factionCache.has(id)) {
    const p = apiRequest<FactionData>(`/roster/data/${encodeURIComponent(id)}`);
    factionCache.set(id, p);
    p.catch(() => factionCache.delete(id));
  }
  return factionCache.get(id)!;
}

// ---------- Age of Sigmar 4 (backend: GET /roster/data/aos/:name) ----------
let aosIndexPromise: Promise<AosIndex> | null = null;
const aosCache = new Map<string, Promise<AosFactionData>>();

export function loadAosIndex(): Promise<AosIndex> {
  aosIndexPromise ??= apiRequest<AosIndex>('/roster/data/aos/index');
  aosIndexPromise.catch(() => (aosIndexPromise = null));
  return aosIndexPromise;
}

export function loadAosFaction(id: string): Promise<AosFactionData> {
  if (!aosCache.has(id)) {
    const p = apiRequest<AosFactionData>(`/roster/data/aos/${encodeURIComponent(id)}`);
    aosCache.set(id, p);
    p.catch(() => aosCache.delete(id));
  }
  return aosCache.get(id)!;
}

/** General's Handbook (AoS): батлпланы, боевые тактики, CP и priority — для «Начать игру» AoS */
let aosBattlepackPromise: Promise<AosBattlepack> | null = null;
export function loadAosBattlepack(): Promise<AosBattlepack> {
  aosBattlepackPromise ??= apiRequest<AosBattlepack>('/roster/data/aos/battlepack');
  aosBattlepackPromise.catch(() => (aosBattlepackPromise = null));
  return aosBattlepackPromise;
}

// ---------- «Поле боя»: раскладки террейна и карты деплоя (40kdc-data) ----------

export type Pt = [number, number];
export interface BfPiece {
  kind: 'area' | 'feature';
  cat: 'dense' | 'light' | null;
  floor?: number;
  poly: Pt[];
  walls?: Pt[][];
}
export interface BfLayout {
  id: string;
  pair: [string, string];
  variant: number;
  deployment: string;
  pieces: BfPiece[];
  objectives: { x: number; y: number; role: 'home' | 'center' | 'expansion' | null }[];
  /** Размеры для расстановки: от края поля (edge — край в координатах поля 60×44) до точки `at` элемента `piece`. */
  guides: { edge: 'left' | 'right' | 'top' | 'bottom'; piece: number; at: Pt; d: number }[];
}
export interface BfDeployment {
  id: string;
  name: string;
  nameRu: string;
  zones: { player: 'attacker' | 'defender'; poly: Pt[] }[];
  territories: { player: 'attacker' | 'defender'; poly: Pt[] }[];
}
export interface BattlefieldData {
  source: { name: string; version: string; credit: string; url: string; license: string; changes: string };
  board: { width: number; height: number };
  dispositions: { id: string; name: string; nameRu: string }[];
  missions: Record<string, string>;
  matchups: { you: string; foe: string; mission: string }[];
  deployments: BfDeployment[];
  layouts: BfLayout[];
}

let battlefieldPromise: Promise<BattlefieldData> | null = null;

export function loadBattlefield(): Promise<BattlefieldData> {
  battlefieldPromise ??= apiRequest<BattlefieldData>('/roster/data/battlefield');
  battlefieldPromise.catch(() => (battlefieldPromise = null));
  return battlefieldPromise;
}

// ---------- карты миссий Chapter Approved 2026-27 (missions.json: структура 40kdc-data, текст — пересказ WarpHub) ----------

/** Раунды блока: any, '1', '1–2', '2+', '2–3', '2–4', '4+', '5', end (конец битвы). */
export type MissionRounds = string;
export interface MissionRow {
  text: string;
  vp: number;
  /** «+N ПО» сверх строки выше (накопительно) */
  plus?: boolean;
  /** «или» — вместо строки выше, засчитывается одна */
  or?: boolean;
  max?: number;
}
export interface MissionBlock {
  rounds: MissionRounds;
  mode?: 'fixed' | 'tactical';
  when: string;
  /** вторичные: чей ход должен заканчиваться (own | opponent | any | opponent-or-r5 — противника или конец 5-го раунда) */
  turn?: 'own' | 'opponent' | 'any' | 'opponent-or-r5';
  /** основные: когда засчитывается (own-turn | own-command | own-command-r5-turn | any-turn | battle-end) */
  at?: 'own-turn' | 'own-command' | 'own-command-r5-turn' | 'any-turn' | 'battle-end';
  rows: MissionRow[];
}
export interface MissionAction {
  name: string;
  nameRu: string;
  starts: string;
  units: string;
  limit: string;
  completes: string;
  effect: string;
  restriction?: string;
}
export interface OnDraw {
  action: 'reshuffle' | 'discard' | 'note';
  round1?: boolean;
  ifActive?: string;
  required?: boolean;
  confirm?: boolean;
}
export interface MissionCard {
  id: string;
  name: string;
  type: 'primary' | 'secondary';
  you?: string;
  foe?: string;
  modes?: ('fixed' | 'tactical')[];
  setup?: string;
  drawn?: string;
  /** правило «при взятии» обязательное (Defend Stronghold в 1-м раунде), иначе — по желанию */
  drawnRequired?: boolean;
  /** «при взятии» в виде данных: reshuffle | discard | note; round1, ifActive (id карты), required, confirm */
  onDraw?: OnDraw;
  note?: string;
  blocks: MissionBlock[];
  actions?: MissionAction[];
}
export interface MissionsData {
  source: { name: string; version: string; url: string; license: string; deck: string; text: string };
  caps: { primaryRound: number; primaryGame: number; secondaryRound: number; secondaryGame: number; fixedSecondaryCard?: number; endOfBattleOutsideRoundCap?: boolean };
  cards: MissionCard[];
}

let missionsPromise: Promise<MissionsData> | null = null;

export function loadMissions(): Promise<MissionsData> {
  missionsPromise ??= apiRequest<MissionsData>('/roster/data/missions');
  missionsPromise.catch(() => (missionsPromise = null));
  return missionsPromise;
}

// ---------- Kill Team 2024 (backend: GET /roster/data/kt/:name, W2 30.10.2026) ----------
let ktIndexPromise: Promise<KtIndex> | null = null;
const ktCache = new Map<string, Promise<KtTeam>>();

export function loadKtIndex(): Promise<KtIndex> {
  ktIndexPromise ??= apiRequest<KtIndex>('/roster/data/kt/index');
  ktIndexPromise.catch(() => (ktIndexPromise = null));
  return ktIndexPromise;
}

export function loadKtTeam(id: string): Promise<KtTeam> {
  if (!ktCache.has(id)) {
    const p = apiRequest<KtTeam>(`/roster/data/kt/${encodeURIComponent(id)}`);
    ktCache.set(id, p);
    p.catch(() => ktCache.delete(id));
  }
  return ktCache.get(id)!;
}
