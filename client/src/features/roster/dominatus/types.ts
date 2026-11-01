/**
 * Dominatus (DM0, 31.10.2026): данные нарративной кампании Warhammer 40,000 — backend/roster-data/dominatus.json.
 * Источник — Wahapedia «Dominatus» (11-я редакция), сверено с каталогом сайта Dominatus владельца. Только типы и данные:
 * игровой режим — DM1, кампания — DM2 (план: проект «claude/warphub-dominatus-plan.md»).
 * Agenda — это основная миссия со своими блоками очков в формате карт колоды миссий (CatalogCard), поэтому её считает
 * тот же движок «Начать игру». 'round-end' (конец раунда) движок поддержит в DM1.
 */
import type { CatalogCard } from '../game/types';

export type AllianceId = 'liberators' | 'oppressors' | 'raiders';
export type CampaignPhase = 1 | 2 | 3;

export interface DominatusAgenda extends Omit<CatalogCard, 'blocks'> {
  agenda: true;
  nameRu: string;
  alliance: AllianceId;
  phase: CampaignPhase;
  /** любое из условий — карта Agenda Achieved (первое — 35+ ПО по этой миссии) */
  achieved: string[];
  /** любое из условий — ещё одна карта Agenda Achieved */
  achievedExtra?: string[];
  /** действия и особые правила миссии (пересказ) */
  rules?: string[];
  /** что сверить с физической колодой (источники расходятся) */
  review?: string;
  blocks: (Omit<CatalogCard['blocks'][number], 'at'> & { at?: CatalogCard['blocks'][number]['at'] | 'round-end'; when: string; rows: (CatalogCard['blocks'][number]['rows'][number] & { text: string })[] })[];
}

export interface DominatusLocation {
  id: string;
  phase: CampaignPhase;
  /** значения D6, при которых выпадает локация */
  rolls: [number, number];
  name: string;
  nameRu: string;
  bonus: string;
  bonusText: string;
  bonusEffect: string;
  /** правила зоны боевых действий — только названия (текст на карте локации) */
  warZone: string[];
}

export interface DominatusData {
  schema: 'warphub-dominatus/1';
  source: { name: string; rules: string; checkedAt: string; crossCheck: string; text: string };
  caps: { primaryRound: number; primaryGame: number; secondaryRound: number; secondaryGame: number; fixedSecondaryCard?: number; endOfBattleOutsideRoundCap?: boolean };
  battleSize: { name: string; points: number };
  alliances: { id: AllianceId; name: string; optional: boolean }[];
  phases: { phase: CampaignPhase; name: string; battles: number }[];
  limits: {
    upgradesPerBattle: number;
    upgradesTitangrave: number;
    agendaAchievedHeld: number;
    agendaAchievedVp: number;
    narrativeControl: number;
    narrativeControlPhase3: number;
    narrativeAscendancy: number;
  };
  locations: DominatusLocation[];
  upgrades: {
    honours: Record<'1' | '2' | '3', string[]>;
    skills: string[];
    relics: Record<AllianceId, string[]>;
    skillsNote?: string;
  };
  cards: DominatusAgenda[];
}

/** Локация по броску D6 в фазе. */
export const locationForRoll = (data: DominatusData, phase: CampaignPhase, roll: number) =>
  data.locations.find((l) => l.phase === phase && roll >= l.rolls[0] && roll <= l.rolls[1]) ?? null;

/** Agenda альянса в фазе (3 карты). */
export const agendasFor = (data: DominatusData, alliance: AllianceId, phase: CampaignPhase) =>
  data.cards.filter((c) => c.alliance === alliance && c.phase === phase);

/** Сколько улучшений можно назначить в битве (Titangrave — больше). */
export const upgradeLimit = (data: DominatusData, locationId: string | null) =>
  locationId === 'titangrave' ? data.limits.upgradesTitangrave : data.limits.upgradesPerBattle;
