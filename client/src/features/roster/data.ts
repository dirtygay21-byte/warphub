import { apiRequest } from '@/apiUtils/general';
import type { DataIndex, FactionData } from './engine/types';

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
