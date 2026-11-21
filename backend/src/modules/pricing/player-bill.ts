/**
 * Счёт для игрока в «Моих записях» (21.11.2026, решение владельца): за что и сколько он заплатит — по ценам из админки,
 * с долей стола («вас за столом двое — стол пополам»). Суммы видны только после записи и только владельцу.
 * Скидки: код мини-игры и «обучающая игра −50%» (лимит 3 проверяет приложение) применяются сразу;
 * «член клуба −10%» — просьба, её подтверждает администратор в «Счёт и оплата».
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { reservationPricingTable } from '../../db/schema/pricing';
import { reservationsTable } from '../../db/schema/reservations';
import { servicesTable } from '../../db/schema/services';
import { listUserRewards } from '../minigames/service';
import { shareNote } from './rules';
import { applyRewardDiscount, applyTrainingDiscount, ensureReservationPricing, PricingError, TRAINING_GAMES_LIMIT } from './service';

const WH_SLUGS = new Set(['wh_game', 'wh_group_training', 'wh_solo_training']);
export const MEMBERSHIP_PERCENT = 10;

const DISCOUNT_LABEL: Record<string, string> = { training: 'Обучающая игра', membership: 'Член клуба', reward: 'Мини-игра', manual: 'Скидка клуба' };

async function ownReservation(userId: string, reservationId: string) {
  const [row] = await db
    .select({ id: reservationsTable.id, status: reservationsTable.status, startsAt: reservationsTable.startsAt, slug: servicesTable.slug, title: servicesTable.title })
    .from(reservationsTable)
    .innerJoin(servicesTable, eq(reservationsTable.serviceId, servicesTable.id))
    .where(and(eq(reservationsTable.id, reservationId), eq(reservationsTable.userId, userId)))
    .limit(1);
  if (!row) throw new PricingError('RESERVATION_NOT_FOUND', 'Запись не найдена');
  return row;
}

export async function getPlayerBill(userId: string, reservationId: string) {
  const r = await ownReservation(userId, reservationId);
  const pricing = r.status === 'cancelled' ? null : await ensureReservationPricing(reservationId);
  if (!pricing) return { reservationId, cancelled: true as const };
  const lines = pricing.charges?.length
    ? pricing.charges.map((c) => ({ title: c.title, unitPrice: c.unitPrice, share: c.share, amount: c.amount, note: shareNote(c.kind, c.share) }))
    : [{ title: r.title ?? r.slug, unitPrice: pricing.unitPrice, share: 1, amount: pricing.baseAmount, note: pricing.baseAmount < pricing.unitPrice ? 'Стол делится между игроками — ваша доля' : null }];
  const applied = (kind: string) => pricing.discounts.some((d) => d.kind === kind);
  const rewards = (await listUserRewards(userId))
    .filter((w) => w.status === 'active' && (w.rewardType === 'percent_discount' || w.rewardType === 'fixed_discount'))
    .map((w) => ({ code: w.code, label: w.label, percent: w.rewardType === 'percent_discount' ? w.rewardValue : null, amount: w.rewardType === 'fixed_discount' ? w.rewardValue : null, expiresAt: w.expiresAt }));
  const open = pricing.remainingAmount > 0 && (!r.startsAt || r.startsAt.getTime() > Date.now() - 12 * 3600_000);
  return {
    reservationId,
    cancelled: false as const,
    status: pricing.status,
    lines,
    army: pricing.armyRentalPoints > 0 ? { points: pricing.armyRentalPoints, amount: pricing.armyRentalAmount } : null,
    subtotal: Math.round((pricing.baseAmount + pricing.armyRentalAmount) * 100) / 100,
    discounts: pricing.discounts.map((d) => ({ id: d.id, kind: d.kind, title: DISCOUNT_LABEL[d.kind] ?? 'Скидка', note: d.note, percent: d.percent, amount: d.amount })),
    totalAmount: pricing.totalAmount,
    paidAmount: pricing.paidAmount,
    remainingAmount: pricing.remainingAmount,
    overpaidAmount: pricing.overpaidAmount,
    offers: {
      canApply: open,
      training: {
        eligible: WH_SLUGS.has(r.slug),
        applied: applied('training'),
        remaining: pricing.trainingGamesRemaining,
        limit: TRAINING_GAMES_LIMIT,
      },
      membership: { percent: MEMBERSHIP_PERCENT, applied: applied('membership'), requested: !!pricing.membershipRequestedAt },
      rewards,
    },
  };
}

export async function playerApplyTraining(userId: string, reservationId: string) {
  await ownReservation(userId, reservationId);
  await applyTrainingDiscount(reservationId, userId);
  return getPlayerBill(userId, reservationId);
}

export async function playerApplyReward(userId: string, reservationId: string, code: string) {
  await ownReservation(userId, reservationId);
  await applyRewardDiscount(reservationId, code, userId);
  return getPlayerBill(userId, reservationId);
}

/** «Я член клуба» — просьба администратору, сама скидка не ставится. */
export async function playerRequestMembership(userId: string, reservationId: string) {
  const r = await ownReservation(userId, reservationId);
  if (r.status === 'cancelled') throw new PricingError('RESERVATION_CANCELLED', 'Запись отменена');
  await ensureReservationPricing(reservationId);
  await db.update(reservationPricingTable).set({ membershipRequestedAt: new Date() }).where(eq(reservationPricingTable.reservationId, reservationId));
  return getPlayerBill(userId, reservationId);
}
