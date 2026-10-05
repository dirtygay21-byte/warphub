import type { DataIndex, FactionData } from './engine/types';

const base = import.meta.env.BASE_URL || './';
const url = (p: string) => base.replace(/\/?$/, '/') + 'data/' + p;

let indexPromise: Promise<DataIndex> | null = null;
const factionCache = new Map<string, Promise<FactionData>>();

export function loadIndex(): Promise<DataIndex> {
  indexPromise ??= fetch(url('index.json'), { cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw new Error('Нет данных: запустите npm run data');
    return r.json();
  });
  return indexPromise;
}

export function loadFaction(id: string): Promise<FactionData> {
  if (!factionCache.has(id)) {
    factionCache.set(
      id,
      loadIndex().then((idx) =>
        fetch(url(`f/${id}.json?v=${encodeURIComponent(idx.lastUpdate ?? idx.generatedAt)}`)).then((r) => {
          if (!r.ok) throw new Error('Не удалось загрузить фракцию ' + id);
          return r.json();
        }),
      ),
    );
  }
  const p = factionCache.get(id)!;
  p.catch(() => factionCache.delete(id));
  return p;
}
