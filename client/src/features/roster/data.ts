import { apiRequest } from '@/apiUtils/general';
import type { DataIndex, FactionData } from './engine/types';
import type { AosFactionData, AosIndex } from './aos/types';

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
