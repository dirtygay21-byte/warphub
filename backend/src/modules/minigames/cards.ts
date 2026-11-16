/**
 * «Легенды Warp Hub»: пакеты, коллекция и счёт очков.
 * Всё решает сервер: содержимое пакета, очки, лимит пакетов в день.
 * Телефон только красиво показывает уже выпавшие карты.
 */
import { and, count, desc, eq, ilike, inArray, sql, sum } from 'drizzle-orm';
import {
  CARD_CATALOG,
  CARD_FACTIONS,
  CARD_RARITIES,
  RARITY_LABELS,
  type CardDef,
  type CardRarity,
} from '../../config/cards';
import { db } from '../../db';
import {
  cardCollectionTable,
  cardPacksTable,
  pointsLedgerTable,
  usersTable,
  pointPromoCodesTable,
} from '../../db/schema';
import { localDateTimeToUtc, toLocalDateParts } from '../booking/rules';
import { escapeHtml, notifyUser } from '../notifications/service';
import { generateRewardCode, rollPack, secureRandom, type PackCard } from './rules';
import { getMinigameSettings, MinigameError } from './service';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const CARD_BY_ID = new Map(CARD_CATALOG.map((card) => [card.id, card]));

/** День клуба (UTC+5) в виде YYYY-MM-DD */
export function clubDayKey(now = new Date()) {
  const p = toLocalDateParts(now);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function nextClubMidnight(now = new Date()) {
  const p = toLocalDateParts(now);
  const today = localDateTimeToUtc(p, 0, 0);
  return new Date(today.getTime() + 86_400_000);
}

const cardView = (card: CardDef) => ({
  ...card,
  factionLabel: CARD_FACTIONS[card.faction],
  rarityLabel: RARITY_LABELS[card.rarity],
});

async function balanceOf(executor: Tx | typeof db, userId: string) {
  const [row] = await executor
    .select({ total: sum(pointsLedgerTable.delta) })
    .from(pointsLedgerTable)
    .where(eq(pointsLedgerTable.userId, userId));
  return Number(row?.total ?? 0);
}

export const getPointsBalance = (userId: string) => balanceOf(db, userId);

const MILESTONE = 25_000;

async function positivePointsOf(executor: Tx | typeof db, userId: string) {
  const [row] = await executor
    .select({ total: sum(pointsLedgerTable.delta) })
    .from(pointsLedgerTable)
    .where(and(eq(pointsLedgerTable.userId, userId), sql`${pointsLedgerTable.delta} > 0`));
  return Number(row?.total ?? 0);
}

async function issueMilestonePromos(tx: Tx, userId: string, rewardValidDays: number) {
  const earned = await positivePointsOf(tx, userId);
  const highestMilestone = Math.floor(earned / MILESTONE) * MILESTONE;
  if (highestMilestone < MILESTONE) return [];

  const milestones = Array.from(
    { length: highestMilestone / MILESTONE },
    (_, index) => (index + 1) * MILESTONE,
  );
  const existingRows = await tx
    .select({ milestone: pointPromoCodesTable.milestone })
    .from(pointPromoCodesTable)
    .where(and(eq(pointPromoCodesTable.userId, userId), inArray(pointPromoCodesTable.milestone, milestones)));
  const existing = new Set(existingRows.map((row) => row.milestone));
  const issued: Array<typeof pointPromoCodesTable.$inferSelect> = [];

  // Один большой приход очков может пройти сразу несколько порогов.
  for (const milestone of milestones) {
    if (existing.has(milestone)) continue;
    let createdPromo: typeof pointPromoCodesTable.$inferSelect | undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateRewardCode();
      const [codeExists] = await tx.select({ id: pointPromoCodesTable.id }).from(pointPromoCodesTable).where(eq(pointPromoCodesTable.code, code)).limit(1);
      if (codeExists) continue;
      const [created] = await tx.insert(pointPromoCodesTable).values({
        userId,
        milestone,
        code,
        percent: 25,
        label: `Промокод ${milestone.toLocaleString('ru-RU')} очков: скидка 25%`,
        expiresAt: new Date(Date.now() + rewardValidDays * 86_400_000),
      }).returning();
      createdPromo = created;
      break;
    }
    if (!createdPromo) throw new MinigameError('INVALID_INPUT', 'Could not generate a unique milestone promo code');
    issued.push(createdPromo);
  }
  return issued;
}

async function packsOpenedToday(executor: Tx | typeof db, userId: string, dayKey: string) {
  const [row] = await executor
    .select({ value: count() })
    .from(cardPacksTable)
    .where(and(eq(cardPacksTable.userId, userId), eq(cardPacksTable.dayKey, dayKey)));
  return Number(row?.value ?? 0);
}

function rarityTable(params: Awaited<ReturnType<typeof getMinigameSettings>>['games']['cards']['params']) {
  const total = CARD_RARITIES.reduce((s, r) => s + params.rarities[r].weight, 0) || 1;
  return CARD_RARITIES.map((r) => ({
    rarity: r,
    label: RARITY_LABELS[r],
    points: params.rarities[r].points,
    chance: Math.round((params.rarities[r].weight / total) * 1000) / 10,
  }));
}

export async function getCardsState(userId: string) {
  const settings = await getMinigameSettings();
  const params = settings.games.cards.params;
  const dayKey = clubDayKey();
  const opened = await packsOpenedToday(db, userId, dayKey);
  const packsLeft = Math.max(0, params.packsPerDay - opened);

  const collection = await db
    .select({ cardId: cardCollectionTable.cardId, count: cardCollectionTable.count })
    .from(cardCollectionTable)
    .where(eq(cardCollectionTable.userId, userId));

  const [lastPack] = await db
    .select()
    .from(cardPacksTable)
    .where(eq(cardPacksTable.userId, userId))
    .orderBy(desc(cardPacksTable.openedAt))
    .limit(1);

  const [packsTotal] = await db
    .select({ value: count() })
    .from(cardPacksTable)
    .where(eq(cardPacksTable.userId, userId));
  const [balance, lifetimePoints] = await Promise.all([
    getPointsBalance(userId),
    positivePointsOf(db, userId),
  ]);

  return {
    enabled: settings.games.cards.enabled,
    catalog: CARD_CATALOG.map(cardView),
    collection: Object.fromEntries(collection.map((c) => [c.cardId, c.count])),
    rarities: rarityTable(params),
    cardsPerPack: params.cardsPerPack,
    packsPerDay: params.packsPerDay,
    packsLeft,
    nextPackAt: packsLeft > 0 ? null : nextClubMidnight().toISOString(),
    balance,
    lifetimePoints,
    nextPromoMilestone: (Math.floor(lifetimePoints / MILESTONE) + 1) * MILESTONE,
    packsOpened: Number(packsTotal?.value ?? 0),
    lastPack: lastPack
      ? {
          id: lastPack.id,
          openedAt: lastPack.openedAt.toISOString(),
          points: lastPack.points,
          cards: (JSON.parse(lastPack.cards) as PackCard[]).map((c) => ({
            ...cardView(CARD_BY_ID.get(c.cardId)!),
            points: c.points,
          })),
        }
      : null,
  };
}

export async function openPack(userId: string) {
  const settings = await getMinigameSettings();
  if (!settings.games.cards.enabled) {
    throw new MinigameError('GAME_DISABLED', 'This game is turned off');
  }
  const params = settings.games.cards.params;
  const dayKey = clubDayKey();

  const result = await db.transaction(async (tx) => {
    // блокируем игрока: два одновременных нажатия не откроют лишний пакет
    await tx.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId)).for('update');

    const opened = await packsOpenedToday(tx, userId, dayKey);
    if (opened >= params.packsPerDay) {
      throw new MinigameError('PACK_LIMIT', 'No packs left today');
    }

    const cards = rollPack(params, CARD_CATALOG, secureRandom);
    const points = cards.reduce((s, c) => s + c.points, 0);

    const [pack] = await tx
      .insert(cardPacksTable)
      .values({ userId, dayKey, cards: JSON.stringify(cards), points })
      .returning();

    // какие карты у игрока уже были — для пометки «Новая!»
    const ids = [...new Set(cards.map((c) => c.cardId))];
    const owned = await tx
      .select({ cardId: cardCollectionTable.cardId })
      .from(cardCollectionTable)
      .where(and(eq(cardCollectionTable.userId, userId), inArray(cardCollectionTable.cardId, ids)));
    const ownedSet = new Set(owned.map((o) => o.cardId));

    const counts = new Map<string, number>();
    for (const c of cards) counts.set(c.cardId, (counts.get(c.cardId) ?? 0) + 1);
    for (const [cardId, n] of counts) {
      await tx
        .insert(cardCollectionTable)
        .values({ userId, cardId, count: n })
        .onConflictDoUpdate({
          target: [cardCollectionTable.userId, cardCollectionTable.cardId],
          set: { count: sql`${cardCollectionTable.count} + ${n}`, lastAt: new Date() },
        });
    }

    await tx.insert(pointsLedgerTable).values({
      userId,
      delta: points,
      reason: 'card_pack',
      refId: pack!.id,
      note: `Пакет карт: ${cards.length} шт.`,
    });

    const promos = await issueMilestonePromos(tx, userId, settings.rewardValidDays);

    const seen = new Set<string>();
    return {
      packId: pack!.id,
      points,
      cards: cards.map((c) => {
        const isNew = !ownedSet.has(c.cardId) && !seen.has(c.cardId);
        seen.add(c.cardId);
        return { ...cardView(CARD_BY_ID.get(c.cardId)!), points: c.points, isNew };
      }),
      packsLeft: params.packsPerDay - opened - 1,
      balance: await balanceOf(tx, userId),
      promos,
    };
  });

  // о легендарной карте сообщает бот
  const legendary = result.cards.filter((c) => c.rarity === 'legendary');
  if (legendary.length) {
    void (async () => {
      const [user] = await db
        .select({ telegramId: usersTable.telegramId })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      notifyUser(
        user?.telegramId,
        `🌟 <b>Легендарная карта: ${legendary.map((c) => escapeHtml(c.name)).join(', ')}</b>\nНачислено: +${legendary.length * legendary[0]!.points} очков\nСчёт: ${result.balance} очков`,
      );
    })().catch((error) => console.warn('[notify] legendary card notification failed', error));
  }

  for (const promo of result.promos) {
    void (async () => {
      const [user] = await db.select({ telegramId: usersTable.telegramId }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      notifyUser(
        user?.telegramId,
        `🎁 <b>Промокод: скидка 25%</b>\nНакоплено: ${promo.milestone.toLocaleString('ru-RU')} очков\nКод: <code>${escapeHtml(promo.code)}</code>\nДействует до: ${promo.expiresAt.toLocaleDateString('ru-RU')}\nПокажите его администратору при записи.`,
      );
    })().catch((error) => console.warn('[notify] milestone promo notification failed', error));
  }

  return {
    ...result,
    nextPackAt: result.packsLeft > 0 ? null : nextClubMidnight().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Очки: история игрока и списание администратором
// ---------------------------------------------------------------------------

export async function getPointsHistory(userId: string, limit = 30) {
  const rows = await db
    .select()
    .from(pointsLedgerTable)
    .where(eq(pointsLedgerTable.userId, userId))
    .orderBy(desc(pointsLedgerTable.createdAt))
    .limit(limit);
  return {
    balance: await getPointsBalance(userId),
    history: rows.map((r) => ({
      id: r.id,
      delta: r.delta,
      reason: r.reason,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export async function adminFindPlayers(query: string) {
  const q = query.trim().replace(/^@/, '');
  if (!q) return [];
  const asId = /^\d+$/.test(q) ? Number(q) : null;
  const users = await db
    .select()
    .from(usersTable)
    .where(asId !== null ? eq(usersTable.telegramId, asId) : ilike(usersTable.username, `%${q}%`))
    .limit(20);
  return Promise.all(
    users.map(async (u) => {
      const [cards] = await db
        .select({ distinct: count(), total: sum(cardCollectionTable.count) })
        .from(cardCollectionTable)
        .where(eq(cardCollectionTable.userId, u.id));
      return {
        id: u.id,
        telegramId: u.telegramId,
        firstName: u.firstName,
        lastName: u.lastName,
        username: u.username,
        balance: await getPointsBalance(u.id),
        uniqueCards: Number(cards?.distinct ?? 0),
        totalCards: Number(cards?.total ?? 0),
      };
    }),
  );
}

export async function adminAdjustPoints(
  adminUserId: string,
  userId: string,
  rawDelta: unknown,
  rawNote: unknown,
) {
  const delta = Number(rawDelta);
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1_000_000) {
    throw new MinigameError('INVALID_INPUT', 'Enter a whole number of points');
  }
  const note = typeof rawNote === 'string' ? rawNote.trim().slice(0, 200) : '';
  const settings = await getMinigameSettings();

  const { balance, promos } = await db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .for('update');
    if (!user) throw new MinigameError('USER_NOT_FOUND', 'Player not found');
    const current = await balanceOf(tx, userId);
    if (current + delta < 0) {
      throw new MinigameError('NOT_ENOUGH_POINTS', 'The player does not have enough points');
    }
    await tx.insert(pointsLedgerTable).values({
      userId,
      delta,
      reason: delta < 0 ? 'admin_spend' : 'admin_add',
      note: note || null,
      createdBy: adminUserId,
    });
    const promos = await issueMilestonePromos(tx, userId, settings.rewardValidDays);
    return { balance: current + delta, promos };
  });

  void (async () => {
    const [user] = await db
      .select({ telegramId: usersTable.telegramId })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    notifyUser(
      user?.telegramId,
      delta < 0
        ? `💠 <b>Списано ${-delta} очков</b>${note ? `\nПричина: ${escapeHtml(note)}` : ''}\nСчёт: ${balance} очков`
        : `💠 <b>Начислено ${delta} очков</b>${note ? `\nПричина: ${escapeHtml(note)}` : ''}\nСчёт: ${balance} очков`,
    );
  })().catch((error) => console.warn('[notify] points notification failed', error));

  for (const promo of promos) {
    void (async () => {
      const [user] = await db.select({ telegramId: usersTable.telegramId }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      notifyUser(user?.telegramId, `🎁 <b>Промокод: скидка 25%</b>\nНакоплено: ${promo.milestone.toLocaleString('ru-RU')} очков\nКод: <code>${escapeHtml(promo.code)}</code>`);
    })().catch((error) => console.warn('[notify] milestone promo notification failed', error));
  }

  return { userId, balance, promos };
}

export async function cardStatsLast7Days() {
  const [row] = await db
    .select({ packs: count(), points: sum(cardPacksTable.points) })
    .from(cardPacksTable)
    .where(sql`${cardPacksTable.openedAt} >= now() - interval '7 days'`);
  return { packs: Number(row?.packs ?? 0), points: Number(row?.points ?? 0) };
}

export type { CardRarity };
