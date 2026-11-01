/**
 * Кампания Dominatus в WarpHub (DM2, 31.10.2026). Одна активная кампания; Warmaster — администраторы (модуль admin),
 * игроки с доступом к WarpBuilder видят кампанию, записывают битвы и отмечают, какую карту оставили.
 * Правила — rules.ts (tests/dominatus-rules.test.ts); сквозная проверка — tests/dominatus-e2e.test.ts.
 * Названия карт и локаций — из roster-data/dominatus.json (те же данные, что у «Начать игру»).
 */
import fs from 'node:fs';
import path from 'node:path';
import { and, asc, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { db } from '../../db';
import {
  dominatusBattlesTable,
  dominatusCampaignsTable,
  dominatusCardsTable,
  dominatusPhasesTable,
  dominatusPlayersTable,
  usersTable,
} from '../../db/schema';
import { rosterDataDir } from '../roster/data';
import {
  agendaToAdd,
  ALLIANCES,
  battleAwards,
  isAlliance,
  leaders,
  narrativePoints,
  relicDraw,
  takeControl,
  type Alliance,
  type BattleResult,
  type Phase,
} from './rules';

export type DominatusErrorCode = 'NO_CAMPAIGN' | 'CAMPAIGN_EXISTS' | 'NOT_FOUND' | 'BAD_INPUT' | 'FORBIDDEN' | 'CONFLICT' | 'NO_DATA';
export class DominatusError extends Error {
  constructor(
    readonly code: DominatusErrorCode,
    message: string,
  ) {
    super(message);
  }
}
const bad = (m: string): never => {
  throw new DominatusError('BAD_INPUT', m);
};

// ---------- данные карт и локаций ----------

type DomData = {
  locations: { id: string; phase: number; rolls: [number, number]; name: string; bonus: string; bonusText: string }[];
  upgrades: { honours: Record<'1' | '2' | '3', string[]>; skills: string[]; relics: Record<Alliance, string[]> };
  cards: { id: string; alliance: string; phase: number }[];
};
let domCache: { mtime: number; data: DomData } | null = null;
function domData(): DomData {
  const file = path.join(rosterDataDir(), 'dominatus.json');
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    throw new DominatusError('NO_DATA', 'Нет данных Dominatus (roster-data/dominatus.json)');
  }
  if (!domCache || domCache.mtime !== stat.mtimeMs) domCache = { mtime: stat.mtimeMs, data: JSON.parse(fs.readFileSync(file, 'utf8')) as DomData };
  return domCache.data;
}

/** Можно ли игроку оставить эту карту (по типу, колоде фазы и альянсу). */
function cardAllowed(kind: string, phase: number, name: string, alliance: Alliance): boolean {
  const u = domData().upgrades;
  if (kind === 'honour') return (u.honours[String(phase) as '1' | '2' | '3'] ?? []).includes(name);
  if (kind === 'skill') return u.skills.includes(name);
  if (kind === 'relic') return (u.relics[alliance] ?? []).includes(name);
  return false;
}

// ---------- чтение ----------

async function activeCampaign() {
  const [c] = await db.select().from(dominatusCampaignsTable).where(eq(dominatusCampaignsTable.status, 'active')).orderBy(desc(dominatusCampaignsTable.id)).limit(1);
  return c ?? null;
}
async function requireCampaign() {
  const c = await activeCampaign();
  if (!c) throw new DominatusError('NO_CAMPAIGN', 'Нет активной кампании Dominatus');
  return c;
}

async function campaignPlayers(campaignId: number) {
  return db
    .select({
      id: dominatusPlayersTable.id,
      userId: dominatusPlayersTable.userId,
      alliance: dominatusPlayersTable.alliance,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      username: usersTable.username,
      telegramId: usersTable.telegramId,
    })
    .from(dominatusPlayersTable)
    .innerJoin(usersTable, eq(usersTable.id, dominatusPlayersTable.userId))
    .where(eq(dominatusPlayersTable.campaignId, campaignId))
    .orderBy(asc(dominatusPlayersTable.id));
}

async function openPhase(campaignId: number) {
  const [p] = await db
    .select()
    .from(dominatusPhasesTable)
    .where(and(eq(dominatusPhasesTable.campaignId, campaignId), eq(dominatusPhasesTable.status, 'open')))
    .limit(1);
  return p ?? null;
}

const nameOf = (p: { firstName: string; lastName: string | null }) => [p.firstName, p.lastName].filter(Boolean).join(' ');

/** Счёт альянсов: битвы, победы, Battle Honour (за кампанию и за открытую фазу), Agenda Achieved на руках, Narrative Points. */
function standings(
  players: Awaited<ReturnType<typeof campaignPlayers>>,
  battles: (typeof dominatusBattlesTable.$inferSelect)[],
  cards: (typeof dominatusCardsTable.$inferSelect)[],
  phases: (typeof dominatusPhasesTable.$inferSelect)[],
  currentPhase: number | null,
) {
  const allianceOf = new Map(players.map((p) => [p.id, p.alliance as Alliance]));
  const row = () => ({ battles: 0, wins: 0, honours: 0, phaseHonours: 0, agendas: 0, narrative: 0 });
  const out = Object.fromEntries(ALLIANCES.map((a) => [a, row()])) as Record<Alliance, ReturnType<typeof row>>;
  for (const b of battles) {
    for (const [pid, me] of [
      [b.player1Id, 'p1'],
      [b.player2Id, 'p2'],
    ] as const) {
      const a = allianceOf.get(pid);
      if (!a) continue;
      out[a].battles += 1;
      if (b.result === me) out[a].wins += 1;
    }
  }
  for (const c of cards) {
    const a = allianceOf.get(c.playerId);
    if (!a || c.discarded) continue;
    if (c.kind === 'honour' && c.name) {
      out[a].honours += 1;
      if (c.phase === currentPhase) out[a].phaseHonours += 1;
    }
    if (c.kind === 'agenda') out[a].agendas += 1;
  }
  for (const ph of phases) for (const [a, n] of Object.entries(ph.narrative ?? {})) if (isAlliance(a)) out[a].narrative += n;
  return out;
}

/** Кампания для игрока (и для админки): фазы, игроки, счёт, битвы; me — моё место, карты и ожидающие выбора награды. */
export async function getCampaignView(userId: string | null) {
  const c = await activeCampaign();
  if (!c) return { campaign: null };
  const [players, phases, battles, cards] = await Promise.all([
    campaignPlayers(c.id),
    db.select().from(dominatusPhasesTable).where(eq(dominatusPhasesTable.campaignId, c.id)).orderBy(asc(dominatusPhasesTable.phase)),
    db.select().from(dominatusBattlesTable).where(eq(dominatusBattlesTable.campaignId, c.id)).orderBy(desc(dominatusBattlesTable.playedAt)),
    db.select().from(dominatusCardsTable).where(eq(dominatusCardsTable.campaignId, c.id)).orderBy(asc(dominatusCardsTable.id)),
  ]);
  const open = phases.find((p) => p.status === 'open') ?? null;
  const me = userId ? players.find((p) => p.userId === userId) ?? null : null;
  const playerName = new Map(players.map((p) => [p.id, nameOf(p)]));
  const loc = (id: string | null) => (id ? domData().locations.find((l) => l.id === id) ?? null : null);
  const dom = domData();
  return {
    /** для выбора карт и локаций: колоды улучшений и локации (названия из dominatus.json) */
    catalog: {
      locations: dom.locations.map((l) => ({ id: l.id, phase: l.phase, rolls: l.rolls, name: l.name, bonus: l.bonus })),
      honours: dom.upgrades.honours,
      skills: dom.upgrades.skills,
      relics: dom.upgrades.relics,
    },
    campaign: { id: c.id, name: c.name, status: c.status, winnerAlliance: c.winnerAlliance, createdAt: c.createdAt.toISOString() },
    phases: phases.map((p) => ({
      phase: p.phase,
      status: p.status,
      location: loc(p.locationId),
      locationRoll: p.locationRoll,
      controller: p.controller,
      ascendant: p.ascendant,
      narrative: p.narrative ?? {},
    })),
    currentPhase: open?.phase ?? null,
    players: players.map((p) => ({ id: p.id, name: nameOf(p), username: p.username, alliance: p.alliance })),
    standings: standings(players, battles, cards, phases, open?.phase ?? null),
    battles: battles.slice(0, 50).map((b) => ({
      id: b.id,
      gameKey: b.gameKey,
      phase: b.phase,
      location: loc(b.locationId)?.name ?? null,
      player1: playerName.get(b.player1Id) ?? '—',
      player2: playerName.get(b.player2Id) ?? '—',
      vp1: b.vp1,
      vp2: b.vp2,
      result: b.result,
      agenda1: b.agenda1,
      agenda2: b.agenda2,
      achieved1: b.achieved1,
      achieved2: b.achieved2,
      playedAt: b.playedAt.toISOString(),
    })),
    me: me
      ? {
          playerId: me.id,
          alliance: me.alliance,
          cards: cards
            .filter((x) => x.playerId === me.id && !x.discarded)
            .map((x) => ({ id: x.id, kind: x.kind, name: x.name, phase: x.phase, source: x.source, draw: x.draw, note: x.note, pending: x.kind !== 'agenda' && !x.name })),
        }
      : null,
  };
}

// ---------- Warmaster (администратор) ----------

export async function createCampaign(name: unknown, adminTelegramId: number) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) bad('Название кампании — от 1 до 120 символов');
  if (await activeCampaign()) throw new DominatusError('CAMPAIGN_EXISTS', 'Уже есть активная кампания — сначала завершите её');
  const [c] = await db.insert(dominatusCampaignsTable).values({ name: (name as string).trim(), createdByTelegramId: adminTelegramId }).returning();
  return c!;
}

export async function setPlayer(userId: string, alliance: unknown) {
  const c = await requireCampaign();
  if (!isAlliance(alliance)) bad('Неизвестный альянс');
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId));
  if (!user) throw new DominatusError('NOT_FOUND', 'Пользователь не найден');
  const [row] = await db
    .insert(dominatusPlayersTable)
    .values({ campaignId: c.id, userId, alliance: alliance as Alliance })
    .onConflictDoUpdate({ target: [dominatusPlayersTable.campaignId, dominatusPlayersTable.userId], set: { alliance: alliance as Alliance } })
    .returning();
  return row!;
}

export async function removePlayer(playerId: number) {
  const c = await requireCampaign();
  const [used] = await db
    .select({ id: dominatusBattlesTable.id })
    .from(dominatusBattlesTable)
    .where(and(eq(dominatusBattlesTable.campaignId, c.id), or(eq(dominatusBattlesTable.player1Id, playerId), eq(dominatusBattlesTable.player2Id, playerId))))
    .limit(1);
  if (used) throw new DominatusError('CONFLICT', 'У игрока есть битвы в кампании — его нельзя убрать');
  const [row] = await db
    .delete(dominatusPlayersTable)
    .where(and(eq(dominatusPlayersTable.id, playerId), eq(dominatusPlayersTable.campaignId, c.id)))
    .returning({ id: dominatusPlayersTable.id });
  if (!row) throw new DominatusError('NOT_FOUND', 'Игрок не найден');
  return row;
}

/** Начать фазу: предыдущая должна быть завершена; локация — своей фазы (бросок D6 — значение, которое выпало). */
export async function startPhase(phase: unknown, locationId: unknown, roll: unknown) {
  const c = await requireCampaign();
  if (phase !== 1 && phase !== 2 && phase !== 3) bad('Фаза — 1, 2 или 3');
  const loc = domData().locations.find((l) => l.id === locationId);
  if (!loc || loc.phase !== phase) bad('Локация не из этой фазы');
  if (roll !== null && roll !== undefined) {
    if (!Number.isInteger(roll) || (roll as number) < 1 || (roll as number) > 6) bad('Бросок D6 — от 1 до 6');
    if ((roll as number) < loc!.rolls[0] || (roll as number) > loc!.rolls[1]) bad('Локация не совпадает с броском D6');
  }
  const phases = await db.select().from(dominatusPhasesTable).where(eq(dominatusPhasesTable.campaignId, c.id));
  if (phases.some((p) => p.status === 'open')) throw new DominatusError('CONFLICT', 'Текущая фаза ещё не завершена');
  if (phases.some((p) => p.phase === phase)) throw new DominatusError('CONFLICT', 'Эта фаза уже была');
  if ((phase as number) > 1 && !phases.some((p) => p.phase === (phase as number) - 1 && p.status === 'resolved')) bad('Сначала завершите предыдущую фазу');
  const [row] = await db
    .insert(dominatusPhasesTable)
    .values({ campaignId: c.id, phase: phase as number, locationId: loc!.id, locationRoll: (roll as number | null | undefined) ?? null })
    .returning();
  return row!;
}

/** Итог фазы без записи: контроль (и ничья для Warmaster), Ascendancy, Narrative Points, Relics к выдаче. */
async function phaseOutcome(campaignId: number, warmasterPick: Alliance | null) {
  const open = await openPhase(campaignId);
  if (!open) throw new DominatusError('CONFLICT', 'Нет открытой фазы');
  const phase = open.phase as Phase;
  const [players, cards] = await Promise.all([
    campaignPlayers(campaignId),
    db.select().from(dominatusCardsTable).where(and(eq(dominatusCardsTable.campaignId, campaignId), eq(dominatusCardsTable.discarded, false))),
  ]);
  const allianceOf = new Map(players.map((p) => [p.id, p.alliance as Alliance]));
  const phaseHonours: Partial<Record<Alliance, number>> = {};
  const allHonours: Partial<Record<Alliance, number>> = {};
  const agendas: Partial<Record<Alliance, number>> = {};
  const agendaByPlayer = new Map<number, number>();
  for (const c of cards) {
    const a = allianceOf.get(c.playerId);
    if (!a) continue;
    if (c.kind === 'honour' && c.name) {
      allHonours[a] = (allHonours[a] ?? 0) + 1;
      if (c.phase === phase) phaseHonours[a] = (phaseHonours[a] ?? 0) + 1;
    }
    if (c.kind === 'agenda') {
      agendas[a] = (agendas[a] ?? 0) + 1;
      agendaByPlayer.set(c.playerId, (agendaByPlayer.get(c.playerId) ?? 0) + 1);
    }
  }
  const control = takeControl(phaseHonours, allHonours, warmasterPick);
  const ascendant = leaders(agendas);
  return {
    open,
    phase,
    phaseHonours,
    agendas,
    controller: control.controller,
    tied: control.tied,
    ascendant,
    narrative: narrativePoints(phase, control.controller, ascendant),
    relics: players.map((p) => ({ playerId: p.id, name: nameOf(p), draw: relicDraw(phase, agendaByPlayer.get(p.id) ?? 0) })).filter((r) => r.draw > 0),
  };
}

export async function previewPhaseEnd(warmasterPick: unknown) {
  const c = await requireCampaign();
  const o = await phaseOutcome(c.id, isAlliance(warmasterPick) ? warmasterPick : null);
  const { open: _open, ...rest } = o;
  return rest;
}

/**
 * Завершить фазу: контроль (при ничьей обязателен выбор Warmaster), Ascendancy, Narrative Points; в фазах 1–2 —
 * награды Relic к выбору (тянуть по числу Agenda Achieved); затем все Agenda Achieved сбрасываются.
 */
export async function resolvePhase(warmasterPick: unknown) {
  const c = await requireCampaign();
  const pick = isAlliance(warmasterPick) ? warmasterPick : null;
  const o = await phaseOutcome(c.id, pick);
  if (o.tied.length > 1 && !o.controller) bad(`Ничья за контроль (${o.tied.join(', ')}) — выберите альянс как Warmaster`);
  await db.transaction(async (tx) => {
    await tx
      .update(dominatusPhasesTable)
      .set({ status: 'resolved', controller: o.controller, ascendant: o.ascendant, narrative: o.narrative as Record<string, number>, resolvedAt: new Date() })
      .where(eq(dominatusPhasesTable.id, o.open.id));
    if (o.relics.length) {
      await tx.insert(dominatusCardsTable).values(
        o.relics.map((r) => ({ campaignId: c.id, playerId: r.playerId, kind: 'relic', name: null, phase: o.phase, source: 'relic', draw: r.draw })),
      );
    }
    await tx
      .update(dominatusCardsTable)
      .set({ discarded: true })
      .where(and(eq(dominatusCardsTable.campaignId, c.id), eq(dominatusCardsTable.kind, 'agenda'), eq(dominatusCardsTable.discarded, false)));
  });
  const { open: _open, ...rest } = o;
  return rest;
}

export async function finishCampaign(winnerAlliance: unknown) {
  const c = await requireCampaign();
  if (winnerAlliance !== null && winnerAlliance !== undefined && !isAlliance(winnerAlliance)) bad('Неизвестный альянс');
  if (await openPhase(c.id)) throw new DominatusError('CONFLICT', 'Сначала завершите текущую фазу');
  const [row] = await db
    .update(dominatusCampaignsTable)
    .set({ status: 'finished', winnerAlliance: (winnerAlliance as Alliance | null | undefined) ?? null, finishedAt: new Date() })
    .where(eq(dominatusCampaignsTable.id, c.id))
    .returning();
  return row!;
}

// ---------- игроки ----------

export interface BattleInput {
  gameKey: unknown;
  player1Id: unknown;
  player2Id: unknown;
  vp1: unknown;
  vp2: unknown;
  result: unknown;
  agenda1?: unknown;
  agenda2?: unknown;
  achieved1?: unknown;
  achieved2?: unknown;
  details?: unknown;
}

const intIn = (v: unknown, min: number, max: number, what: string) => {
  if (!Number.isInteger(v) || (v as number) < min || (v as number) > max) bad(`${what}: целое от ${min} до ${max}`);
  return v as number;
};

/**
 * Записать битву открытой фазы (любой из двух игроков). Повторная запись той же игры (gameKey) обновляет битву и
 * пересоздаёт её награды — пока никто не выбрал карту по этой битве. Награды: Battle Honour / Skill к выбору
 * (тянуть draw, оставить одну), Path to Conquest — сразу, Agenda Achieved — до предела 3 на руках.
 */
export async function recordBattle(userId: string, input: BattleInput) {
  const c = await requireCampaign();
  const open = await openPhase(c.id);
  if (!open) throw new DominatusError('CONFLICT', 'Нет открытой фазы кампании');
  if (typeof input.gameKey !== 'string' || !/^[\w:.-]{4,80}$/.test(input.gameKey)) bad('Нет id игры');
  const p1 = intIn(input.player1Id, 1, 2 ** 31, 'Игрок 1');
  const p2 = intIn(input.player2Id, 1, 2 ** 31, 'Игрок 2');
  if (p1 === p2) bad('Игроки должны быть разными');
  const players = await campaignPlayers(c.id);
  const a = players.find((p) => p.id === p1);
  const b = players.find((p) => p.id === p2);
  if (!a || !b) bad('Игрок не участвует в кампании');
  if (a!.alliance === b!.alliance) bad('Игроки должны быть из разных альянсов');
  if (a!.userId !== userId && b!.userId !== userId) throw new DominatusError('FORBIDDEN', 'Записать битву может только её участник');
  const vp1 = intIn(input.vp1, 0, 200, 'ПО игрока 1');
  const vp2 = intIn(input.vp2, 0, 200, 'ПО игрока 2');
  if (input.result !== 'p1' && input.result !== 'p2' && input.result !== 'draw') bad('Итог — p1, p2 или draw');
  const result = input.result as BattleResult;
  const agendaIds = new Set(domData().cards.map((x) => x.id));
  const agenda = (v: unknown, who: { alliance: string }) => {
    if (v === null || v === undefined || v === '') return null;
    const card = domData().cards.find((x) => x.id === v);
    if (!agendaIds.has(v as string) || !card) bad('Неизвестная Agenda');
    if (card!.alliance !== who.alliance || card!.phase !== open.phase) bad('Agenda не своего альянса или фазы');
    return v as string;
  };
  const agenda1 = agenda(input.agenda1, a!);
  const agenda2 = agenda(input.agenda2, b!);
  const achieved1 = agenda1 ? intIn(input.achieved1 ?? 0, 0, 2, 'Agenda Achieved игрока 1') : 0;
  const achieved2 = agenda2 ? intIn(input.achieved2 ?? 0, 0, 2, 'Agenda Achieved игрока 2') : 0;
  const details = input.details && typeof input.details === 'object' ? (input.details as Record<string, unknown>) : null;
  if (details && JSON.stringify(details).length > 50_000) bad('Слишком большой снимок игры');

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(dominatusBattlesTable)
      .where(and(eq(dominatusBattlesTable.campaignId, c.id), eq(dominatusBattlesTable.gameKey, input.gameKey as string)));
    if (existing) {
      if (existing.phase !== open.phase) throw new DominatusError('CONFLICT', 'Битва записана в прошлой фазе — её уже не изменить');
      const chosen = await tx
        .select({ name: dominatusCardsTable.name, kind: dominatusCardsTable.kind })
        .from(dominatusCardsTable)
        .where(eq(dominatusCardsTable.battleId, existing.id));
      if (chosen.some((x) => x.kind !== 'agenda' && x.name && x.name !== 'Path to Conquest'))
        throw new DominatusError('CONFLICT', 'По этой битве уже выбраны карты — изменить её может Warmaster');
      await tx.delete(dominatusCardsTable).where(eq(dominatusCardsTable.battleId, existing.id));
    }
    const values = { campaignId: c.id, phase: open.phase, locationId: open.locationId, gameKey: input.gameKey as string, player1Id: p1, player2Id: p2, vp1, vp2, result, agenda1, agenda2, achieved1, achieved2, details, recordedByUserId: userId };
    const [battle] = existing
      ? await tx.update(dominatusBattlesTable).set(values).where(eq(dominatusBattlesTable.id, existing.id)).returning()
      : await tx.insert(dominatusBattlesTable).values(values).returning();

    const awards = battleAwards(open.phase as Phase, result, [achieved1, achieved2]);
    const held = await tx
      .select({ playerId: dominatusCardsTable.playerId })
      .from(dominatusCardsTable)
      .where(and(eq(dominatusCardsTable.campaignId, c.id), eq(dominatusCardsTable.kind, 'agenda'), eq(dominatusCardsTable.discarded, false), inArray(dominatusCardsTable.playerId, [p1, p2])));
    const heldBy = (pid: number) => held.filter((h) => h.playerId === pid).length;
    const rows: (typeof dominatusCardsTable.$inferInsert)[] = [];
    const lost: string[] = [];
    for (const [i, pid] of [p1, p2].entries()) {
      const award = awards[i];
      if (award) rows.push({ campaignId: c.id, playerId: pid, kind: award.kind, name: award.fixed ?? null, phase: open.phase, battleId: battle!.id, source: 'battle', draw: award.draw });
      const gained = i === 0 ? achieved1 : achieved2;
      const add = agendaToAdd(heldBy(pid), gained);
      for (let k = 0; k < add; k++) rows.push({ campaignId: c.id, playerId: pid, kind: 'agenda', name: null, phase: open.phase, battleId: battle!.id, source: 'agenda' });
      if (add < gained) lost.push(nameOf(i === 0 ? a! : b!));
    }
    if (rows.length) await tx.insert(dominatusCardsTable).values(rows);
    return { battle: battle!, updated: !!existing, agendaLimitReached: lost };
  });
}

/** Отметить, какую карту игрок оставил (награда, ожидающая выбора): карта своего типа, колоды фазы и альянса, без повторов. */
export async function claimCard(userId: string, cardId: number, name: unknown) {
  const c = await requireCampaign();
  if (typeof name !== 'string' || !name.trim()) bad('Выберите карту');
  const [card] = await db
    .select({ card: dominatusCardsTable, userId: dominatusPlayersTable.userId, alliance: dominatusPlayersTable.alliance })
    .from(dominatusCardsTable)
    .innerJoin(dominatusPlayersTable, eq(dominatusPlayersTable.id, dominatusCardsTable.playerId))
    .where(and(eq(dominatusCardsTable.id, cardId), eq(dominatusCardsTable.campaignId, c.id)));
  if (!card) throw new DominatusError('NOT_FOUND', 'Награда не найдена');
  if (card.userId !== userId) throw new DominatusError('FORBIDDEN', 'Это не ваша награда');
  if (card.card.kind === 'agenda' || card.card.name) throw new DominatusError('CONFLICT', 'Карта уже выбрана');
  const n = (name as string).trim();
  if (!cardAllowed(card.card.kind, card.card.phase, n, card.alliance as Alliance)) bad('Эта карта не из той колоды');
  const [dup] = await db
    .select({ id: dominatusCardsTable.id })
    .from(dominatusCardsTable)
    .where(and(eq(dominatusCardsTable.playerId, card.card.playerId), eq(dominatusCardsTable.name, n), eq(dominatusCardsTable.discarded, false)));
  if (dup) bad('Эта карта у вас уже есть — вторую такую держать нельзя');
  const [row] = await db
    .update(dominatusCardsTable)
    .set({ name: n })
    .where(and(eq(dominatusCardsTable.id, cardId), isNull(dominatusCardsTable.name)))
    .returning();
  if (!row) throw new DominatusError('CONFLICT', 'Карта уже выбрана');
  return row;
}
