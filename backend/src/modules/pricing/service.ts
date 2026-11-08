import { and, asc, count, desc, eq, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
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
import { normalizeRewardCode } from '../minigames/rules';
import { basePriceFor, paymentStatus, roundMoney, totalWithDiscounts, validateManualDiscount, type PricingDiscountInput } from './rules';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;
type ReservationRow = typeof reservationsTable.$inferSelect;

const TRAINING_SERVICE_SLUGS = new Set(['wh_group_training', 'wh_solo_training']);
const DEFAULT_THIRD_TRAINING_DISCOUNT = 50;
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
    const isTraining = TRAINING_SERVICE_SLUGS.has(service.slug);
    return {
      id: service.id,
      slug: service.slug,
      title: service.title,
      billingMode: (price?.billingMode ?? 'per_guest') as PricingBillingMode,
      unitPrice: price?.unitPrice ?? 0,
      thirdGameDiscountPercent: price?.thirdGameDiscountPercent ?? (isTraining ? DEFAULT_THIRD_TRAINING_DISCOUNT : 0),
      effectiveFrom: price?.effectiveFrom?.toISOString() ?? null,
    };
  }));
}

export async function upsertServicePrice(input: {
  serviceId: number;
  billingMode: PricingBillingMode;
  unitPrice: number;
  thirdGameDiscountPercent?: number;
  effectiveFrom?: Date;
  createdBy: string;
}) {
  if (!Number.isFinite(input.unitPrice) || input.unitPrice < 0) {
    throw new PricingError('INVALID_PRICE', 'Цена должна быть неотрицательным числом');
  }
  const [service] = await db.select({ id: servicesTable.id, slug: servicesTable.slug }).from(servicesTable).where(eq(servicesTable.id, input.serviceId)).limit(1);
  if (!service) throw new PricingError('SERVICE_NOT_FOUND', 'Услуга не найдена');
  const third = input.thirdGameDiscountPercent ?? (TRAINING_SERVICE_SLUGS.has(service.slug) ? DEFAULT_THIRD_TRAINING_DISCOUNT : 0);
  if (!Number.isFinite(third) || third < 0 || third > 100) {
    throw new PricingError('INVALID_DISCOUNT', 'Скидка третьей тренировки должна быть от 0 до 100%');
  }
  const [created] = await db.insert(servicePricesTable).values({
    serviceId: input.serviceId,
    billingMode: input.billingMode,
    unitPrice: roundMoney(input.unitPrice),
    thirdGameDiscountPercent: third,
    effectiveFrom: input.effectiveFrom ?? new Date(),
    createdBy: input.createdBy,
  }).returning();
  return created!;
}

export async function createReservationPricing(
  tx: Tx,
  reservation: ReservationRow,
  options: { trainingOrdinal?: 'latest' | 'historical' } = {},
) {
  const [price, service] = await Promise.all([
    currentServicePrice(reservation.serviceId, tx),
    tx.select({ slug: servicesTable.slug }).from(servicesTable).where(eq(servicesTable.id, reservation.serviceId)).limit(1).then((rows) => rows[0]),
  ]);
  const billingMode = (price?.billingMode ?? 'per_guest') as PricingBillingMode;
  const unitPrice = price?.unitPrice ?? 0;
  const baseAmount = basePriceFor(billingMode, unitPrice, reservation.partySize ?? 1);
  await tx.insert(reservationPricingTable).values({
    reservationId: reservation.id,
    billingMode,
    unitPrice,
    baseAmount,
    totalAmount: baseAmount,
  });

  const isTraining = TRAINING_SERVICE_SLUGS.has(service?.slug ?? '');
  const thirdPercent = price?.thirdGameDiscountPercent ?? 0;
  if (price && isTraining && thirdPercent > 0) {
    // Одновременные записи одного игрока на одну услугу получают порядковые номера последовательно.
    const sequenceLock = `${reservation.userId}:${reservation.serviceId}`;
    await tx.execute(sql`select pg_advisory_xact_lock(25011, hashtext(${sequenceLock}))`);
    const trainingOrdinal = options.trainingOrdinal ?? 'latest';
    const [row] = await tx.select({ value: count() }).from(reservationsTable).where(and(
      eq(reservationsTable.userId, reservation.userId),
      eq(reservationsTable.serviceId, reservation.serviceId),
      inArray(reservationsTable.status, ACTIVE_RESERVATION_STATUSES),
      trainingOrdinal === 'historical'
        ? or(
            lt(reservationsTable.createdAt, reservation.createdAt),
            and(eq(reservationsTable.createdAt, reservation.createdAt), lt(reservationsTable.id, reservation.id)),
          )
        : undefined,
    ));
    // Для новой записи после блокировки считаем её вместе со всеми уже завершёнными транзакциями соседей.
    // Для старой записи без счёта восстанавливаем её исторический номер по времени создания.
    const ordinal = Number(row?.value ?? 0) + (trainingOrdinal === 'historical' ? 1 : 0);
    if (ordinal % 3 === 0) {
      await tx.insert(reservationDiscountsTable).values({
        reservationId: reservation.id,
        kind: 'training',
        percent: thirdPercent,
        note: `Каждая третья тренировка: скидка ${thirdPercent}%`,
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
  if (!existing) await createReservationPricing(tx, reservation, { trainingOrdinal: 'historical' });
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
  const totalAmount = totalWithDiscounts(pricing.baseAmount, discounts);
  if (totalAmount + 0.0001 < pricing.paidAmount) {
    throw new PricingError('DISCOUNT_BELOW_PAID', 'Скидка не может уменьшить сумму ниже уже внесённой оплаты');
  }
  const [updated] = await tx.update(reservationPricingTable).set({ totalAmount, updatedAt: new Date() }).where(eq(reservationPricingTable.reservationId, reservationId)).returning();
  return updated!;
}

export async function getReservationPricing(reservationId: string, executor: Executor = db) {
  const [pricing] = await executor.select().from(reservationPricingTable).where(eq(reservationPricingTable.reservationId, reservationId)).limit(1);
  if (!pricing) return null;
  const [discounts, payments] = await Promise.all([
    executor.select().from(reservationDiscountsTable).where(eq(reservationDiscountsTable.reservationId, reservationId)).orderBy(asc(reservationDiscountsTable.createdAt), asc(reservationDiscountsTable.id)),
    executor.select().from(reservationPaymentsTable).where(eq(reservationPaymentsTable.reservationId, reservationId)).orderBy(asc(reservationPaymentsTable.createdAt), asc(reservationPaymentsTable.id)),
  ]);
  return {
    ...pricing,
    status: paymentStatus(pricing.totalAmount, pricing.paidAmount),
    remainingAmount: roundMoney(Math.max(0, pricing.totalAmount - pricing.paidAmount)),
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

export async function applyRewardDiscount(reservationId: string, rawCode: string, adminUserId: string) {
  const code = normalizeRewardCode(rawCode);
  return db.transaction(async (tx) => {
    const reservation = await lockReservation(tx, reservationId);
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
    if (discount.kind === 'training') throw new PricingError('DISCOUNT_FORBIDDEN', 'Автоматическую скидку за третью тренировку удалить нельзя');
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
