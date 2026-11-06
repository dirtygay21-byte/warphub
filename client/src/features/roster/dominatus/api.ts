/**
 * Кампания Dominatus (DM2): API игрока — backend/src/modules/dominatus (GET /roster/dominatus/campaign, запись битвы,
 * выбор оставленной карты). Warmaster — админ-панель (/admin/dominatus).
 */
import { useCallback, useEffect, useState } from 'react';
import { call, type ApiResult } from '../online';
import type { AllianceId } from './types';

export const ALLIANCE_RU: Record<AllianceId, string> = { liberators: 'Liberators', oppressors: 'Oppressors', raiders: 'Raiders' };
export const KIND_RU = { honour: 'Battle Honour', skill: 'Battle Skill', relic: 'Relic', agenda: 'Agenda Achieved' } as const;

export type CardKind = keyof typeof KIND_RU;
export type DominatusExportStatus = 'pending' | 'sending' | 'applied' | 'retry' | 'dead';
export interface DominatusExportInfo {
  status: DominatusExportStatus | null;
  error: string | null;
  battleIdOnSite: string | null;
  updated: boolean;
}
export interface CampaignCard {
  id: number;
  kind: CardKind;
  name: string | null;
  phase: number;
  source: string;
  draw: number;
  note: string | null;
  /** награда ждёт выбора: тянуть draw карт и оставить одну */
  pending: boolean;
}
export interface CampaignStanding {
  battles: number;
  wins: number;
  honours: number;
  phaseHonours: number;
  agendas: number;
  narrative: number;
}
export interface CampaignView {
  catalog: {
    locations: { id: string; phase: number; rolls: [number, number]; name: string; bonus: string }[];
    honours: Record<'1' | '2' | '3', string[]>;
    skills: string[];
    relics: Record<AllianceId, string[]>;
  };
  campaign: { id: number; name: string; status: string; winnerAlliance: AllianceId | null; createdAt: string };
  phases: {
    phase: number;
    status: 'open' | 'resolved';
    location: { id: string; name: string; bonus: string; nameRu?: string } | null;
    locationRoll: number | null;
    controller: AllianceId | null;
    ascendant: AllianceId[];
    narrative: Partial<Record<AllianceId, number>>;
  }[];
  currentPhase: number | null;
  players: { id: number; name: string; username: string | null; alliance: AllianceId }[];
  standings: Record<AllianceId, CampaignStanding>;
  battles: {
    id: number;
    /** id игры «Начать игру» (на двух телефонах — общий): по нему второй телефон видит, что битва записана */
    gameKey: string;
    phase: number;
    location: string | null;
    player1: string;
    player2: string;
    vp1: number;
    vp2: number;
    result: 'p1' | 'p2' | 'draw';
    agenda1: string | null;
    agenda2: string | null;
    achieved1: number;
    achieved2: number;
    playedAt: string;
    exportStatus: DominatusExportStatus | null;
    exportError: string | null;
    exportBattleId: string | null;
  }[];
  me: { playerId: number; alliance: AllianceId; cards: CampaignCard[] } | null;
}
export type CampaignResponse = CampaignView | { campaign: null };
export const hasCampaign = (v: CampaignResponse | null): v is CampaignView => !!v && v.campaign !== null;

export interface BattleBody {
  gameKey: string;
  player1Id: number;
  player2Id: number;
  vp1: number;
  vp2: number;
  result: 'p1' | 'p2' | 'draw';
  agenda1: string | null;
  agenda2: string | null;
  achieved1: number;
  achieved2: number;
  details: Record<string, unknown>;
}

export const getCampaign = () => call<CampaignResponse>('/roster/dominatus/campaign');
export const recordCampaignBattle = (body: BattleBody) =>
  call<{ updated: boolean; agendaLimitReached: string[] }>('/roster/dominatus/battles', { method: 'POST', body: JSON.stringify(body) });
export const claimCampaignCard = (id: number, name: string) => call<unknown>(`/roster/dominatus/cards/${id}/claim`, { method: 'POST', body: JSON.stringify({ name }) });
export const getDominatusExport = (gameKey: string) => call<DominatusExportInfo>(`/roster/dominatus/exports/${encodeURIComponent(gameKey)}`);
export const uploadDominatusBattle = (gameKey: string) => call<DominatusExportInfo>('/roster/dominatus/exports', { method: 'POST', body: JSON.stringify({ gameKey }) });
export const retryDominatusBattle = (gameKey: string) => call<DominatusExportInfo>(`/roster/dominatus/exports/${encodeURIComponent(gameKey)}/retry`, { method: 'POST' });

/** Колода, из которой выбирается ожидающая карта. */
export function deckFor(view: CampaignView, card: CampaignCard, alliance: AllianceId): string[] {
  if (card.kind === 'honour') return view.catalog.honours[String(card.phase) as '1' | '2' | '3'] ?? [];
  if (card.kind === 'skill') return view.catalog.skills;
  if (card.kind === 'relic') return view.catalog.relics[alliance] ?? [];
  return [];
}

/** Кампания: загрузка и перезагрузка. error — нет связи или нет доступа (не «нет кампании»). */
export function useCampaign() {
  const [view, setView] = useState<CampaignResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const apply = useCallback((r: ApiResult<CampaignResponse>) => {
    if (r.ok) {
      setView(r.data);
      setError(null);
    } else setError(r.error);
    return r;
  }, []);
  const reload = useCallback(async () => apply(await getCampaign()), [apply]);
  useEffect(() => {
    let alive = true;
    void getCampaign().then((r) => alive && apply(r));
    return () => {
      alive = false;
    };
  }, [apply]);
  return { view, error, reload, loading: !view && !error };
}
