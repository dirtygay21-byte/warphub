/** Dominatus (DM1): данные dominatus.json → часть каталога движка «Начать игру» (Agenda как основные миссии). */
import type { MissionCard } from '../data';
import type { CatalogCard, DominatusCatalog } from '../game/types';
import type { DominatusData } from './types';

export function dominatusCatalog(data: DominatusData): { cards: CatalogCard[]; dominatus: DominatusCatalog } {
  const u = data.upgrades;
  return {
    cards: data.cards as unknown as CatalogCard[],
    dominatus: {
      locations: data.locations.map((l) => ({ id: l.id, phase: l.phase, rolls: l.rolls })),
      alliances: data.alliances.map((a) => a.id),
      upgrades: [...Object.values(u.honours).flat(), ...u.skills, ...Object.values(u.relics).flat()],
      limits: { upgradesPerBattle: data.limits.upgradesPerBattle, upgradesTitangrave: data.limits.upgradesTitangrave },
    },
  };
}

/**
 * Agenda как карты для экранов «Начать игру» (просмотр карты, подсчёт): правила миссии — «Подготовка»,
 * условия Agenda Achieved — «Примечание».
 */
export function agendaMissionCards(data: DominatusData): MissionCard[] {
  return data.cards.map((c) => ({
    id: c.id,
    name: `${c.name} (Agenda)`,
    type: 'primary' as const,
    setup: c.rules?.join(' ') || undefined,
    note: [
      `Agenda Achieved — любое: ${c.achieved.join(' / ')}`,
      c.achievedExtra?.length ? `Ещё одна карта — любое: ${c.achievedExtra.join(' / ')}` : null,
      c.review ? `Сверить с картой: ${c.review}` : null,
    ]
      .filter(Boolean)
      .join(' '),
    blocks: c.blocks as unknown as MissionCard['blocks'],
  }));
}
