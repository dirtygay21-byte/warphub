import { and, asc, count, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  reservationDiscountsTable,
  reservationPaymentsTable,
  reservationPricingTable,
  servicePricesTable,
  type PricingBillingMode,
} from '../../db/schema/pricing';
import { reservationsTable } from '../../db/schema/reservations';
import { servicesTable } from '../../db/schema/services';
import { minigameRewardsTable } from '../../db/schema/minigames';
import { pointPromoCodesTable } from '../../db/schema/point-promos';
import { normalizeRewardCode } from '../minigames/rules';
import { armyRentalPriceFor, basePriceFor, paymentStatus, roundMoney, servicePricingDefaults, totalWithDiscounts, validateManualDiscount, type PricingDiscountInput } from './rules';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;
type ReservationRow = typeof reservationsTable.$inferSelect;

const GROUP_TRAINING_SLUG = 'wh_group_training';
const WH_SERVICE_SLUGS = new Set(['wh_game', 'wh_group_training', 'wh_solo_training']);
export const TRAINING_GAMES_LIMIT = 3;
export const DEFAULT_ARMY_RENTAL_PRICE_PER_1000 = 1000;
const DEFAULT_KILL_TEAM_RENTAL_POINTS = 1000;
const ACTIVE_RESERVATION_STATUSES = ['pending', 'confirmed'] as const;

export class PricingError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'PricingError';
    this.code = code;
  }
}

export async function currentServicePrice(serviceId: number, executor: Executor = db) {
  const [row] = await executor
    .select()
    .from(servicePricesTable)
    .where(and(eq(servicePricesTable.serviceId, serviceId), lte(servicePricesTable.effectiveFrom, new Date())))
    .orderBy(desc(servicePricesTable.effectiveFrom), desc(servicePricesTable.createdAt), desc(servicePricesTable.id))
    .limit(1);
  return row ?? null;
}

export async function listServicePrices() {
  const services = await db.select().from(servicesTable).orderBy(asc(servicesTable.sortOrder), asc(servicesTable.id));
  return Promise.all(services.map(async (service) => {
    const price = await currentServicePrice(service.id);
    const defaults = servicePricingDefaults(service.slug);
    return {
      id: service.id,
      slug: service.slug,
      title: service.title,
      billingMode: (price?.billingMode ?? defaults.billingMode) as PricingBillingMode,
      unitPrice: price?.unitPrice ?? defaults.unitPrice,
      armyRentalPricePer1000: price?.armyRentalPricePer1000 ?? defaults.armyRentalPricePer1000,
      ownMaterialsPrice: price?.ownMaterialsPrice ?? defaults.ownMaterialsPrice,
      clubMaterialsPrice: price?.clubMaterialsPrice ?? defaults.clubMaterialsPrice,
      thirdGameDiscountPercent: price?.thirdGameDiscountPercent ?? defaults.thirdGameDiscountPercent,
      effectiveFrom: price?.effectiveFrom?.toISOString() ?? null,
    };
  }));
}

export async function upsertServicePrice(input: {
  serviceId: number;
  billingMode: PricingBillingMode;
  unitPrice: number;
  armyRentalPricePer1000?: number;
  ownMaterialsPrice?: number;
  clubMaterialsPrice?: number;
  thirdGameDiscountPercent?: number;
  effectiveFrom?: Date;
  createdBy: string;
}) {
  if (!Number.isFinite(input.unitPrice) || input.unitPrice < 0) {
    throw new PricingError('INVALID_PRICE', 'Цена должна быть неотрицательным числом');
  }
  const [service] = await db.select({ id: servicesTable.id, slug: servicesTable.slug }).from(servicesTable).where(eq(servicesTable.id, input.serviceId)).limit(1);
  if (!service) throw new PricingError('SERVICE_NOT_FOUND', 'Услуга не найдена');
  const defaults = servicePricingDefaults(service.slug);
  const armyRentalPricePer1000 = input.armyRentalPricePer1000 ?? defaults.armyRentalPricePer1000;
  const ownMaterialsPrice = input.ownMaterialsPrice ?? defaults.ownMaterialsPrice;
  const clubMaterialsPrice = input.clubMaterialsPrice ?? defaults.clubMaterialsPrice;
  for (const [code, value, message] of [
    ['INVALID_ARMY_RENTAL_PRICE', armyRentalPricePer1000, 'Цена аренды армии за 1000 очков должна быть неотрицательным числом'],
    ['INVALID_MATERIALS_PRICE', ownMaterialsPrice, 'Цена со своими материалами должна быть неотрицательным числом'],
    ['INVALID_MATERIALS_PRICE', clubMaterialsPrice, 'Цена с материалами клуба должна быть неотрицательным числом'],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) throw new PricingError(code, message);
  }
  const third = input.thirdGameDiscountPercent ?? defaults.thirdGameDiscountPercent;
  if (!Number.isFinite(third) || third < 0 || third > 100) {
    throw new PricingError('INVALID_DISCOUNT', 'Скидка на первые игры должна быть от 0 до 100%');
  }
  const [created] = await db.insert(servicePricesTable).values({
    serviceId: input.serviceId,
    billingMode: input.billingMode,
    unitPrice: roundMoney(input.unitPrice),
    armyRentalPricePer1000: roundMoney(armyRentalPricePer1000),
    ownMaterialsPrice: roundMoney(ownMaterialsPrice),
    clubMaterialsPrice: roundMoney(clubMaterialsPrice),
    thirdGameDiscountPercent: third,
    effectiveFrom: input.effectiveFrom ?? new Date(),
    createdBy: input.createdBy,
  }).returning();
  return created!;
}

function rentedArmyPoints(reservation: ReservationRow): number {
  const rentedSeats = reservation.seatClubArmyOptions?.filter(Boolean).length ?? 0;
  if (rentedSeats === 0 || reservation.details?.kind !== 'wh_player') return 0;
  const pointsPerArmy = reservation.details.points ?? DEFAULT_KILL_TEAM_RENTAL_POINTS;
  return pointsPerArmy * rentedSeats;
}

async function countTrainingGames(executor: Executor, userId: string): Promise<number> {
  const [row] = await executor.select({ value: count() })
    .from(reservationDiscountsTable)
    .innerJoin(reservationsTable, eq(reservationDiscountsTable.reservationId, reservationsTable.id))
    .where(and(
      eq(reservationsTable.userId, userId),
      eq(reservationDiscountsTable.kind, 'training'),
      inArray(reservationsTable.status, ACTIVE_RESERVATION_STATUSES),
    ));
  return Number(row?.value ?? 0);
}

export async function createReservationPricing(tx: Tx, reservation: ReservationRow) {
  const [price, service] = await Promise.all([
    currentServicePrice(reservation.serviceId, tx),
    tx.select({ slug: servicesTable.slug }).from(servicesTable).where(eq(servicesTable.id, reservation.serviceId)).limit(1).then((rows) => rows[0]),
  ]);
  const defaults = servicePricingDefaults(service?.slug ?? '');
  const billingMode = (price?.billingMode ?? defaults.billingMode) as PricingBillingMode;
  const priceVariant = reservation.details?.kind === 'painting'
    ? reservation.details.paintSource === 'club' ? 'club_materials' as const : 'own_materials' as const
    : 'standard' as const;
  const unitPrice = priceVariant === 'club_materials'
    ? price?.clubMaterialsPrice ?? defaults.clubMaterialsPrice
    : priceVariant === 'own_materials'
      ? price?.ownMaterialsPrice ?? defaults.ownMaterialsPrice
      : price?.unitPrice ?? defaults.unitPrice;
  const baseAmount = basePriceFor(billingMode, unitPrice, reservation.partySize ?? 1);
  const armyRentalPoints = rentedArmyPoints(reservation);
  const armyRentalPricePer1000 = price?.armyRentalPricePer1000 ?? defaults.armyRentalPricePer1000;
  const armyRentalAmount = armyRentalPriceFor(armyRentalPoints, armyRentalPricePer1000);
  await tx.insert(reservationPricingTable).values({
    reservationId: reservation.id,
    billingMode,
    priceVariant,
    unitPrice,
    baseAmount,
    armyRentalPoints,
    armyRentalPricePer1000,
    armyRentalAmount,
    totalAmount: roundMoney(baseAmount + armyRentalAmount),
  });

  const thirdPercent = price?.thirdGameDiscountPercent ?? defaults.thirdGameDiscountPercent;
  if (price && service?.slug === GROUP_TRAINING_SLUG && thirdPercent > 0) {
    // Скидки на обучающие игры имеют общий лимит на игрока, поэтому блокировка тоже общая.
    await tx.execute(sql`select pg_advisory_xact_lock(25011, hashtext(${reservation.userId}))`);
    const trainingGamesUsed = await countTrainingGames(tx, reservation.userId);
    if (trainingGamesUsed < TRAINING_GAMES_LIMIT) {
      await tx.insert(reservationDiscountsTable).values({
        reservationId: reservation.id,
        kind: 'training',
        percent: thirdPercent,
        note: `Обучающие игры: скидка ${thirdPercent}%`,
      });
    }
  }
  await recalculateReservationTotal(tx, reservation.id);
}

async function lockReservation(tx: Tx, reservationId: string) {
  const [reservation] = await tx.select().from(reservationsTable).where(eq(reservationsTable.id, reservationId)).limit(1).for('update');
  if (!reservation) throw new PricingError('RESERVATION_NOT_FOUND', 'Запись не найдена');
  return reservation;
}

async function createReservationPricingIfMissing(tx: Tx, reservation: ReservationRow) {
  const [existing] = await tx.select({ id: reservationPricingTable.reservationId }).from(reservationPricingTable).where(eq(reservationPricingTable.reservationId, reservation.id)).limit(1);
  if (!existing) await createReservationPricing(tx, reservation);
}

export async function ensureReservationPricing(reservationId: string) {
  return db.transaction(async (tx) => {
    const reservation = await lockReservation(tx, reservationId);
    await createReservationPricingIfMissing(tx, reservation);
    return getReservationPricing(reservationId, tx);
  });
}

async function recalculateReservationTotal(tx: Tx, reservationId: string) {
  const [pricing] = await tx.select().from(reservationPricingTable).where(eq(reservationPricingTable.reservationId, reservationId)).limit(1).for('update');
  if (!pricing) throw new PricingError('PRICING_NOT_FOUND', 'Цена записи не найдена');
  const discounts = await tx.select().from(reservationDiscountsTable).where(eq(reservationDiscountsTable.reservationId, reservationId)).orderBy(asc(reservationDiscountsTable.createdAt), asc(reservationDiscountsTable.id));
  const totalAmount = totalWithDiscounts(roundMoney(pricing.baseAmount + pricing.armyRentalAmount), discounts);
  if (totalAmount + 0.0001 < pricing.paidAmount) {
    throw new PricingError('DISCOUNT_BELOW_PAID', 'Скидка не может уменьшить сумму ниже уже внесённой оплаты');
  }
  const [updated] = await tx.update(reservationPricingTable).set({ totalAmount, updatedAt: new Date() }).where(eq(reservationPricingTable.reservationId, reservationId)).returning();
  return updated!;
}

export async function getReservationPricing(reservationId: string, executor: Executor = db) {
  const [pricing] = await executor.select().from(reservationPricingTable).where(eq(reservationPricingTable.reservationId, reservationId)).limit(1);
  if (!pricing) return null;
  const [reservation] = await executor.select({ userId: reservationsTable.userId, serviceSlug: servicesTable.slug })
    .from(reservationsTable)
    .innerJoin(servicesTable, eq(reservationsTable.serviceId, servicesTable.id))
    .where(eq(reservationsTable.id, reservationId))
    .limit(1);
  if (!reservation) throw new PricingError('RESERVATION_NOT_FOUND', 'Запись не найдена');
  const [discounts, payments, trainingGamesUsed] = await Promise.all([
    executor.select().from(reservationDiscountsTable).where(eq(reservationDiscountsTable.reservationId, reservationId)).orderBy(asc(reservationDiscountsTable.createdAt), asc(reservationDiscountsTable.id)),
    executor.select().from(reservationPaymentsTable).where(eq(reservationPaymentsTable.reservationId, reservationId)).orderBy(asc(reservationPaymentsTable.createdAt), asc(reservationPaymentsTable.id)),
    countTrainingGames(executor, reservation.userId),
  ]);
  return {
    ...pricing,
    serviceSlug: reservation.serviceSlug,
    status: paymentStatus(pricing.totalAmount, pricing.paidAmount),
    remainingAmount: roundMoney(Math.max(0, pricing.totalAmount - pricing.paidAmount)),
    trainingGamesUsed,
    trainingGamesRemaining: Math.max(0, TRAINING_GAMES_LIMIT - trainingGamesUsed),
    discounts,
    payments,
  };
}

export async function applyManualDiscount(reservationId: string, input: PricingDiscountInput & { createdBy: string }) {
  if (input.kind !== 'membership' && input.kind !== 'manual') {
    throw new PricingError('INVALID_DISCOUNT', 'Здесь можно добавить только скидку за членство или ручную скидку');
  }
  try {
    validateManualDiscount(input);
  } catch (error) {
    throw new PricingError('INVALID_DISCOUNT', (error as Error).message);
  }
  return db.transaction(async (tx) => {
    const reservation = await lockReservation(tx, reservationId);
    await createReservationPricingIfMissing(tx, reservation);
    await tx.insert(reservationDiscountsTable).values({
      reservationId,
      kind: input.kind,
      percent: input.percent ?? null,
      amount: input.amount ?? null,
      note: input.note.trim(),
      createdBy: input.createdBy,
    });
    await recalculateReservationTotal(tx, reservationId);
    return getReservationPricing(reservationId, tx);
  });
}

export async function applyTrainingDiscount(reservationId: string, createdBy: string) {
  return db.transaction(async (tx) => {
    const reservation = await lockReservation(tx, reservationId);
    const [service] = await tx.select({ slug: servicesTable.slug }).from(servicesTable).where(eq(servicesTable.id, reservation.serviceId)).limit(1);
    if (!service || !WH_SERVICE_SLUGS.has(service.slug)) {
      throw new PricingError('TRAINING_SERVICE', 'Обучающие игры доступны только для Warhammer-записей');
    }
    await createReservationPricingIfMissing(tx, reservation);
    await tx.execute(sql`select pg_advisory_xact_lock(25011, hashtext(${reservation.userId}))`);
    const [existing] = await tx.select({ id: reservationDiscountsTable.id }).from(reservationDiscountsTable).where(and(
      eq(reservationDiscountsTable.reservationId, reservationId),
      eq(reservationDiscountsTable.kind, 'training'),
    )).limit(1);
    if (existing) throw new PricingError('TRAINING_DISCOUNT_EXISTS', 'Скидка на обучающую игру уже применена к этой записи');
    const trainingGamesUsed = await countTrainingGames(tx, reservation.userId);
    if (trainingGamesUsed >= TRAINING_GAMES_LIMIT) {
      throw new PricingError('TRAINING_LIMIT_REACHED', 'У игрока уже есть три обучающие игры со скидкой');
    }
    await tx.insert(reservationDiscountsTable).values({
      reservationId,
      kind: 'training',
      percent: 50,
      note: 'Обучающие игры: скидка 50%',
      createdBy,
    });
    await recalculateReservationTotal(tx, reservationId);
    return getReservationPricing(reservationId, tx);
  });
}

export async function applyRewardDiscount(reservationId: string, rawCode: string, adminUserId: string) {
  const code = normalizeRewardCode(rawCode);
  return db.transaction(async (tx) => {
    const reservation = await lockReservation(tx, reservationId);
    const [promo] = await tx.select().from(pointPromoCodesTable).where(and(
      eq(pointPromoCodesTable.code, code),
      eq(pointPromoCodesTable.userId, reservation.userId),
    )).limit(1).for('update');
    if (promo) {
      if (promo.usedAt) throw new PricingError('REWARD_USED', 'Промокод уже использован');
      if (promo.expiresAt.getTime() <= Date.now()) throw new PricingError('REWARD_EXPIRED', 'Срок действия промокода истёк');
      await createReservationPricingIfMissing(tx, reservation);
      await tx.insert(reservationDiscountsTable).values({
        reservationId,
        kind: 'reward',
        percent: promo.percent,
        amount: null,
        rewardId: null,
        note: promo.label,
        createdBy: adminUserId,
      });
      const [used] = await tx.update(pointPromoCodesTable).set({ usedAt: new Date(), usedBy: adminUserId }).where(and(
        eq(pointPromoCodesTable.id, promo.id),
        isNull(pointPromoCodesTable.usedAt),
      )).returning();
      if (!used) throw new PricingError('REWARD_USED', 'Промокод уже использован');
      await recalculateReservationTotal(tx, reservationId);
      return getReservationPricing(reservationId, tx);
    }
    const [reward] = await tx.select().from(minigameRewardsTable).where(and(
      eq(minigameRewardsTable.code, code),
      eq(minigameRewardsTable.userId, reservation.userId),
    )).limit(1).for('update');
    if (!reward) throw new PricingError('REWARD_NOT_FOUND', 'Награда не найдена для этого пользователя');
    if (reward.usedAt) throw new PricingError('REWARD_USED', 'Награда уже использована');
    if (reward.expiresAt.getTime() <= Date.now()) throw new PricingError('REWARD_EXPIRED', 'Срок действия награды истёк');
    if (reward.rewardType !== 'percent_discount' && reward.rewardType !== 'fixed_discount') {
      throw new PricingError('REWARD_TYPE', 'Этот тип награды не даёт денежную скидку');
    }
    const [duplicate] = await tx.select({ id: reservationDiscountsTable.id }).from(reservationDiscountsTable).where(eq(reservationDiscountsTable.rewardId, reward.id)).limit(1);
    if (duplicate) throw new PricingError('REWARD_USED', 'Награда уже применена к записи');

    await createReservationPricingIfMissing(tx, reservation);
    await tx.insert(reservationDiscountsTable).values({
      reservationId,
      kind: 'reward',
      percent: reward.rewardType === 'percent_discount' ? reward.rewardValue : null,
      amount: reward.rewardType === 'fixed_discount' ? reward.rewardValue : null,
      rewardId: reward.id,
      note: reward.label,
      createdBy: adminUserId,
    });
    const [used] = await tx.update(minigameRewardsTable).set({ usedAt: new Date(), usedBy: adminUserId }).where(and(
      eq(minigameRewardsTable.id, reward.id),
      isNull(minigameRewardsTable.usedAt),
    )).returning();
    if (!used) throw new PricingError('REWARD_USED', 'Награда уже использована');
    await recalculateReservationTotal(tx, reservationId);
    return getReservationPricing(reservationId, tx);
  });
}

export async function removeManualDiscount(discountId: string) {
  return db.transaction(async (tx) => {
    const [initial] = await tx.select().from(reservationDiscountsTable).where(eq(reservationDiscountsTable.id, discountId)).limit(1);
    if (!initial) throw new PricingError('DISCOUNT_NOT_FOUND', 'Скидка не найдена');
    await lockReservation(tx, initial.reservationId);
    const [discount] = await tx.select().from(reservationDiscountsTable).where(eq(reservationDiscountsTable.id, discountId)).limit(1);
    if (!discount) throw new PricingError('DISCOUNT_NOT_FOUND', 'Скидка не найдена');
    if (discount.kind === 'reward') throw new PricingError('REWARD_USED', 'Использованная награда не восстанавливается');
    await tx.delete(reservationDiscountsTable).where(eq(reservationDiscountsTable.id, discountId));
    await recalculateReservationTotal(tx, discount.reservationId);
    return getReservationPricing(discount.reservationId, tx);
  });
}

export async function addReservationPayment(input: {
  reservationId: string;
  amount: number;
  method: 'cash' | 'card' | 'transfer' | 'other';
  note?: string;
  createdBy: string;
}) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new PricingError('INVALID_PAYMENT', 'Сумма оплаты должна быть больше нуля');
  }
  return db.transaction(async (tx) => {
    const reservation = await lockReservation(tx, input.reservationId);
    await createReservationPricingIfMissing(tx, reservation);
    const [pricing] = await tx.select().from(reservationPricingTable).where(eq(reservationPricingTable.reservationId, input.reservationId)).limit(1).for('update');
    if (!pricing) throw new PricingError('PRICING_NOT_FOUND', 'Цена записи не найдена');
    const paidAmount = roundMoney(pricing.paidAmount + input.amount);
    if (paidAmount > pricing.totalAmount + 0.0001) {
      throw new PricingError('PAYMENT_EXCEEDED', 'Оплата превышает остаток к оплате');
    }
    await tx.insert(reservationPaymentsTable).values({
      reservationId: input.reservationId,
      amount: roundMoney(input.amount),
      method: input.method,
      note: input.note?.trim() || null,
      createdBy: input.createdBy,
    });
    await tx.update(reservationPricingTable).set({ paidAmount, updatedAt: new Date() }).where(eq(reservationPricingTable.reservationId, input.reservationId));
    return getReservationPricing(input.reservationId, tx);
  });
}
