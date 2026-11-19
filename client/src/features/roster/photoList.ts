/**
 * Фото армии (16.11.2026): какие фото показать в ленте редактора и на карточке ростера. Без React и DOM — проверяется
 * тестом tools/roster-data/tests/unit-photos.test.ts.
 */

/** Юнит ростера для фото: ключ фото (photos.ts → photoKey), название и подпись для просмотра, uid — чтобы открыть карточку. */
export interface PhotoItem {
  key: string;
  name: string;
  sub?: string;
  uid?: string;
}

/** Юниты с фото в порядке ростера, по одному на ключ (несколько копий одного юнита — одно фото). */
export function photoItems<T extends PhotoItem>(items: readonly T[], has: (key: string) => boolean): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    if (seen.has(it.key) || !has(it.key)) continue;
    seen.add(it.key);
    out.push(it);
  }
  return out;
}

/** Плашки на карточке ростера: до max фото, сколько фото не поместилось и сколько видов юнитов без фото. */
export function rosterCardPhotos<T extends PhotoItem>(items: readonly T[], has: (key: string) => boolean, max = 4): { shown: T[]; more: number; without: number } {
  const all = photoItems(items, has);
  const without = new Set(items.filter((i) => !has(i.key)).map((i) => i.key)).size;
  return { shown: all.slice(0, max), more: Math.max(0, all.length - max), without };
}
