import { makeRng, pickIndex } from '../game/rng';

export const WARCRY_TERRAIN_CARDS = Array.from({ length: 24 }, (_, index) => {
  const number = index + 1;
  return {
    id: `hog-${number}`,
    number,
    name: `Heart of Ghur · Terrain ${number}`,
    image: `/roster-maps/warcry-terrain/HoGTerrain${number}.png`,
    sourceImage: `https://raw.githubusercontent.com/CCFrankUrbainsky/warcryMissionShuffler/main/public/cards/terrain/ghur/HoGTerrain${number}.png`,
  };
});

export type WarcryTerrainMode = 'card' | 'alternative';
export type WarcryTerrainFeatureType = 'ruin' | 'obscuring' | 'place-of-power';
export type WarcryTerrainFeature = {
  id: string;
  type: WarcryTerrainFeatureType;
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
};
export type WarcryTerrainSetup = { mode: WarcryTerrainMode; cardId: string; features: WarcryTerrainFeature[]; seed?: string };

const GENERATOR_TYPES: readonly WarcryTerrainFeatureType[] = ['ruin', 'obscuring', 'place-of-power'];
const GENERATOR_QUARTERS = [
  { x: [5, 14], y: [5, 10] },
  { x: [16, 25], y: [5, 10] },
  { x: [5, 14], y: [12, 17] },
  { x: [16, 25], y: [12, 17] },
] as const;
const randomBetween = (rng: () => number, range: readonly [number, number]) => range[0] + rng() * (range[1] - range[0]);
const overlaps = (a: WarcryTerrainFeature, b: WarcryTerrainFeature) => {
  const gap = 0.25;
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + gap;
};

/** Случайная играбельная альтернатива: не копия официальной карты, а 2 новых контура в каждой четверти. */
export function generateAlternativeTerrain(seed: string): WarcryTerrainFeature[] {
  const rng = makeRng(seed, 'warcry-alternative-terrain');
  const features: WarcryTerrainFeature[] = [];
  for (const [quarter, bounds] of GENERATOR_QUARTERS.entries()) {
    for (let slot = 0; slot < 2; slot++) {
      let placed: WarcryTerrainFeature | null = null;
      for (let attempt = 0; attempt < 200 && !placed; attempt++) {
        const candidate: WarcryTerrainFeature = {
          id: `terrain-${quarter + 1}-${slot + 1}`,
          type: GENERATOR_TYPES[pickIndex(rng, GENERATOR_TYPES.length)]!,
          x: randomBetween(rng, bounds.x),
          y: randomBetween(rng, bounds.y),
          w: 2,
          h: 2,
          angle: pickIndex(rng, 2) * 90,
        };
        if (features.every((other) => !overlaps(candidate, other))) placed = candidate;
      }
      if (!placed) throw new Error(`Не удалось собрать случайную расстановку для четверти ${quarter + 1}; попробуйте новый seed`);
      features.push(placed);
    }
  }
  return features;
}

const QUARTERS = [
  { id: 'СЗ', label: 'северо-западной' },
  { id: 'СВ', label: 'северо-восточной' },
  { id: 'ЮЗ', label: 'юго-западной' },
  { id: 'ЮВ', label: 'юго-восточной' },
] as const;

export const warcryTerrainCard = (cardId: string) => WARCRY_TERRAIN_CARDS.find((card) => card.id === cardId) ?? WARCRY_TERRAIN_CARDS[0]!;

const rotatedSize = (feature: WarcryTerrainFeature) => {
  const quarterTurn = Math.abs(Math.round(feature.angle / 90)) % 2 === 1;
  return { w: quarterTurn ? feature.h : feature.w, h: quarterTurn ? feature.w : feature.h };
};

/** Alternative terrain rules: 2+ features per quarter and all floor-touching parts at least 4″ from every edge. */
export function validateAlternativeTerrain(features: readonly WarcryTerrainFeature[]): string[] {
  const issues: string[] = [];
  for (const quarter of QUARTERS) {
    const count = features.filter((feature) => {
      const left = quarter.id.endsWith('З');
      const top = quarter.id.startsWith('С');
      return (left ? feature.x < 15 : feature.x >= 15) && (top ? feature.y < 11 : feature.y >= 11);
    }).length;
    if (count < 2) issues.push(`В ${quarter.label} четверти: ${count}/2 элемента`);
  }
  for (const feature of features) {
    const { w, h } = rotatedSize(feature);
    if (![w, h, feature.x, feature.y, feature.angle].every(Number.isFinite) || w <= 0 || h <= 0) {
      issues.push(`${feature.id}: задайте положительные размеры контура`);
      continue;
    }
    const epsilon = 0.001; // погрешность преобразования экранных координат в дюймы, а не изменение правила 4″
    if (feature.x - w / 2 < 4 - epsilon || feature.x + w / 2 > 26 + epsilon || feature.y - h / 2 < 4 - epsilon || feature.y + h / 2 > 18 + epsilon) {
      issues.push(`${feature.id}: контур должен быть целиком не ближе 4″ от каждого края`);
    }
  }
  return issues;
}
