import { and, asc, eq, inArray, lte } from 'drizzle-orm';
import { db } from '../../db';
import { dominatusBattlesTable, dominatusCardsTable, dominatusExportsTable, dominatusPhasesTable } from '../../db/schema';
import { activeCampaign, campaignPlayers, DominatusError, openPhase } from './service';

export type DominatusExportStatus = 'pending' | 'sending' | 'applied' | 'retry' | 'dead';
type ExportRow = typeof dominatusExportsTable.$inferSelect;

const SOURCE = 'warphub';
const RETRYABLE_HTTP = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

function iso(date: Date | null | undefined) {
  return date ? date.toISOString() : null;
}

export function retryDelayMs(attempts: number) {
  return Math.min(600_000, 30_000 * 2 ** Math.max(0, attempts - 1));
}

export function statusForHttpError(status: number): DominatusExportStatus {
  return RETRYABLE_HTTP.has(status) || status >= 500 ? 'retry' : 'dead';
}

function errorText(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2000);
}

export async function buildDominatusBattlePayload(userId: string, gameKey: string) {
  if (!/^[\w:.-]{4,80}$/.test(gameKey)) throw new DominatusError('BAD_INPUT', 'Некорректный gameKey');
  const campaign = await activeCampaign();
  if (!campaign) throw new DominatusError('NO_CAMPAIGN', 'Нет активной кампании Dominatus');
  const open = await openPhase(campaign.id);
  if (!open) throw new DominatusError('CONFLICT', 'Загрузка возможна только во время открытой фазы');

  const [battle] = await db
    .select()
    .from(dominatusBattlesTable)
    .where(and(eq(dominatusBattlesTable.campaignId, campaign.id), eq(dominatusBattlesTable.gameKey, gameKey)))
    .limit(1);
  if (!battle) throw new DominatusError('NOT_FOUND', 'Битва не найдена');
  if (battle.phase !== open.phase) throw new DominatusError('CONFLICT', 'Загружать можно только битву текущей открытой фазы');

  const players = await campaignPlayers(campaign.id);
  const p1 = players.find((p) => p.id === battle.player1Id);
  const p2 = players.find((p) => p.id === battle.player2Id);
  if (!p1 || !p2) throw new DominatusError('BAD_INPUT', 'Игроки битвы не найдены');
  if (p1.userId !== userId && p2.userId !== userId) throw new DominatusError('FORBIDDEN', 'Загружать битву может только её участник');

  const [phases, cards] = await Promise.all([
    db.select().from(dominatusPhasesTable).where(eq(dominatusPhasesTable.campaignId, campaign.id)).orderBy(asc(dominatusPhasesTable.phase)),
    db.select().from(dominatusCardsTable).where(and(eq(dominatusCardsTable.campaignId, campaign.id), inArray(dominatusCardsTable.playerId, [p1.id, p2.id]))),
  ]);
  const playerName = (player: { firstName: string; lastName: string | null }) => [player.firstName, player.lastName].filter(Boolean).join(' ');

  return {
    campaign: { id: campaign.id, name: campaign.name, status: campaign.status, createdAt: iso(campaign.createdAt) },
    phases: phases.map((phase) => ({
      id: phase.id,
      phase: phase.phase,
      status: phase.status,
      locationKey: phase.locationId,
      locationRoll: phase.locationRoll,
      controller: phase.controller,
      ascendant: phase.ascendant,
      narrative: phase.narrative ?? {},
    })),
    players: players.map((player) => ({ id: player.id, name: playerName(player), username: player.username, alliance: player.alliance })),
    battle: {
      id: battle.id,
      gameKey: battle.gameKey,
      phase: battle.phase,
      player1Id: battle.player1Id,
      player2Id: battle.player2Id,
      playedAt: iso(battle.playedAt),
      vp1: battle.vp1,
      vp2: battle.vp2,
      result: battle.result,
      agenda1: battle.agenda1,
      agenda2: battle.agenda2,
      achieved1: battle.achieved1,
      achieved2: battle.achieved2,
      locationKey: battle.locationId,
      details: battle.details,
    },
    cards: cards.map((card) => ({
      id: card.id,
      playerId: card.playerId,
      battleId: card.battleId,
      kind: card.kind,
      name: card.name,
      phase: card.phase,
      source: card.source,
      draw: card.draw,
      note: card.note,
      pending: card.kind !== 'agenda' && !card.name,
      discarded: card.discarded,
    })),
  };
}

export type DominatusUploadPayload = Awaited<ReturnType<typeof buildDominatusBattlePayload>>;

function publicExport(row?: ExportRow | null) {
  if (!row) return { status: null, error: null, battleIdOnSite: null, updated: false };
  return { status: row.status, error: row.lastError, battleIdOnSite: row.battleIdOnSite, updated: row.status === 'applied' && row.attempts > 1 };
}

export async function getDominatusExport(userId: string, gameKey: string) {
  await buildDominatusBattlePayload(userId, gameKey);
  const [row] = await db.select().from(dominatusExportsTable).where(eq(dominatusExportsTable.gameKey, gameKey)).limit(1);
  return publicExport(row);
}

export async function enqueueDominatusExport(userId: string, gameKey: string) {
  const payload = await buildDominatusBattlePayload(userId, gameKey);
  const battleId = Number(payload.battle.id);
  const campaignId = Number(payload.campaign.id);
  const [existing] = await db.select().from(dominatusExportsTable).where(eq(dominatusExportsTable.gameKey, gameKey)).limit(1);
  if (existing?.status === 'sending' && existing.updatedAt.getTime() > Date.now() - 60_000) {
    throw new DominatusError('CONFLICT', 'Эта битва уже загружается');
  }
  if (existing) {
    await db
      .update(dominatusExportsTable)
      .set({ campaignId, battleId, payload, status: 'pending', lastError: null, nextAttemptAt: new Date() })
      .where(eq(dominatusExportsTable.gameKey, gameKey));
  } else {
    await db.insert(dominatusExportsTable).values({ gameKey, campaignId, battleId, payload });
  }
  return processDominatusExport(gameKey);
}

class ExportHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function sendToDominatus(payload: DominatusUploadPayload) {
  const base = (process.env.DOMINATUS_API_URL ?? 'https://warp-dominatus.ru').replace(/\/$/, '');
  const token = process.env.DOMINATUS_INTEGRATION_TOKEN;
  if (!token) throw new ExportHttpError(503, 'На сайте Dominatus не настроен integration token');
  const response = await fetch(`${base}/api/integrations/warphub/battles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-integration-token': token },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  if (!response.ok) throw new ExportHttpError(response.status, text.slice(0, 1000) || `HTTP ${response.status}`);
  let body: { ok?: boolean; data?: { battleId?: string } };
  try {
    body = JSON.parse(text);
  } catch {
    throw new ExportHttpError(502, 'Сайт Dominatus вернул не JSON');
  }
  if (!body.ok || !body.data?.battleId) throw new ExportHttpError(502, 'Сайт Dominatus не подтвердил battleId');
  return body.data.battleId;
}

export async function processDominatusExport(gameKey: string) {
  const [row] = await db.select().from(dominatusExportsTable).where(eq(dominatusExportsTable.gameKey, gameKey)).limit(1);
  if (!row) throw new DominatusError('NOT_FOUND', 'Задача загрузки не найдена');
  if (row.status === 'sending' && row.updatedAt.getTime() > Date.now() - 60_000) return publicExport(row);

  await db.update(dominatusExportsTable).set({ status: 'sending', attempts: row.attempts + 1, lastError: null }).where(eq(dominatusExportsTable.gameKey, gameKey));
  try {
    const battleIdOnSite = await sendToDominatus(row.payload as DominatusUploadPayload);
    await db
      .update(dominatusExportsTable)
      .set({ status: 'applied', battleIdOnSite, appliedAt: new Date(), lastError: null })
      .where(eq(dominatusExportsTable.gameKey, gameKey));
  } catch (error) {
    const status = error instanceof ExportHttpError ? statusForHttpError(error.status) : 'retry';
    await db
      .update(dominatusExportsTable)
      .set({ status, lastError: errorText(error), nextAttemptAt: new Date(Date.now() + retryDelayMs(row.attempts + 1)) })
      .where(eq(dominatusExportsTable.gameKey, gameKey));
  }
  const [current] = await db.select().from(dominatusExportsTable).where(eq(dominatusExportsTable.gameKey, gameKey)).limit(1);
  return publicExport(current);
}

export async function processPendingDominatusExports() {
  const rows = await db
    .select({ gameKey: dominatusExportsTable.gameKey })
    .from(dominatusExportsTable)
    .where(and(inArray(dominatusExportsTable.status, ['pending', 'retry']), lte(dominatusExportsTable.nextAttemptAt, new Date())));
  for (const row of rows) await processDominatusExport(row.gameKey);
}

export function startDominatusExportWorker() {
  const timer = setInterval(() => {
    void processPendingDominatusExports().catch((error) => console.error('[dominatus-export]', errorText(error)));
  }, 15_000);
  timer.unref();
  return timer;
}
