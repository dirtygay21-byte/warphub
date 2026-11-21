import type { PricingBillingMode } from '../../db/schema/pricing';

export type PricingDiscountInput = {
  kind: 'training' | 'membership' | 'reward' | 'manual';
  percent?: number | null;
  amount?: number | null;
  note: string;
  rewardId?: string | null;
};

export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function basePriceFor(mode: PricingBillingMode, unitPrice: number, partySize: number): number {
  const guests = Math.max(1, Math.floor(partySize));
  if (mode === 'per_table') return roundMoney(unitPrice);
  if (mode === 'per_pair') return roundMoney(unitPrice * Math.ceil(guests / 2));
  return roundMoney(unitPrice * guests);
}

export function armyRentalPriceFor(points: number, pricePer1000: number): number {
  return roundMoney(Math.max(0, points) * Math.max(0, pricePer1000) / 1000);
}

export type ServicePricingDefaults = {
  billingMode: PricingBillingMode;
  unitPrice: number;
  armyRentalPricePer1000: number;
  thirdGameDiscountPercent: number;
  ownMaterialsPrice: number;
  clubMaterialsPrice: number;
};

export function servicePricingDefaults(slug: string): ServicePricingDefaults {
  const base: ServicePricingDefaults = {
    billingMode: 'per_guest',
    unitPrice: 0,
    armyRentalPricePer1000: 1000,
    thirdGameDiscountPercent: 0,
    ownMaterialsPrice: 0,
    clubMaterialsPrice: 0,
  };
  if (slug === 'wh_game') return { ...base, billingMode: 'per_table', unitPrice: 1000 };
  if (slug === 'wh_group_training') {
    return { ...base, billingMode: 'per_pair', unitPrice: 1500, thirdGameDiscountPercent: 50 };
  }
  if (slug === 'wh_solo_training') return { ...base, unitPrice: 800 };
  if (slug === 'wh_painting') {
    return { ...base, unitPrice: 500, ownMaterialsPrice: 500, clubMaterialsPrice: 1000 };
  }
  if (slug === 'club_visit') return { ...base, unitPrice: 500 };
  return base;
}

/** Percent discounts are sequential; fixed discounts are subtracted afterwards in the same order. */
export function totalWithDiscounts(baseAmount: number, discounts: PricingDiscountInput[]): number {
  return roundMoney(discounts.reduce((total, discount) => {
    let next = total;
    if (discount.percent != null) next *= Math.max(0, 1 - discount.percent / 100);
    if (discount.amount != null) next -= discount.amount;
    return Math.max(0, next);
  }, Math.max(0, baseAmount)));
}

export function paymentStatus(totalAmount: number, paidAmount: number): 'free' | 'unpaid' | 'partial' | 'paid' {
  if (totalAmount === 0) return 'free';
  if (paidAmount === 0) return 'unpaid';
  return paidAmount < totalAmount ? 'partial' : 'paid';
}

export function validateManualDiscount(input: PricingDiscountInput) {
  if (input.kind === 'reward') throw new Error('Use rewardCode for reward discounts');
  if ((input.percent == null) === (input.amount == null)) {
    throw new Error('Укажите либо процент, либо сумму скидки');
  }
  if (input.percent != null && (input.percent < 0 || input.percent > 100)) {
    throw new Error('Процент скидки должен быть от 0 до 100');
  }
  if (input.amount != null && input.amount < 0) throw new Error('Скидка не может быть отрицательной');
  if (!input.note.trim()) throw new Error('Укажите причину скидки');
}

export const PAYMENT_METHOD_LABEL = {
  cash: 'Наличные',
  card: 'Карта',
  transfer: 'Перевод',
  other: 'Другое',
} as const;

// ---------- позиции счёта (20.11.2026, решение владельца) ----------

export type ChargeLine = { kind: 'service' | 'table'; serviceId: number | null; title: string; unitPrice: number; share: number; amount: number };

export const TABLE_CHARGE_TITLE = 'Аренда стола';
const TRAINING_SLUGS = new Set(['wh_group_training', 'wh_solo_training']);

export const chargeLine = (line: Omit<ChargeLine, 'amount'>): ChargeLine => ({ ...line, share: roundShare(line.share), amount: roundMoney(line.unitPrice * line.share) });
export const roundShare = (share: number) => Math.round(share * 10_000) / 10_000;

/**
 * Позиции счёта по правилу владельца: всегда «услуга + стол».
 * - Игра: только «Аренда стола» (тариф игры), делится между игроками за столом; один игрок платит весь стол.
 * - Парная (групповая) тренировка: тренировка и стол делятся на места за столом — каждый платит свою долю (½),
 *   даже пока второй не записался.
 * - Индивидуальная тренировка: тренировка и весь стол — на одного.
 * - Остальное (покраска, посещение, D&D): одна строка по тарифу услуги, как раньше.
 */
export function autoChargeLines(input: {
  slug: string;
  service: { id: number; title: string; unitPrice: number; billingMode: PricingBillingMode };
  /** тариф игры за столом — цена аренды стола (решение владельца 20.11.2026) */
  table: { serviceId: number | null; unitPrice: number } | null;
  partySize: number;
  /** мест за столом у услуги */
  seats: number;
  /** сколько мест занято за этим столом в это время (вместе с этой записью) */
  tableGuests: number;
  atTable: boolean;
}): ChargeLine[] {
  const party = Math.max(1, Math.floor(input.partySize));
  const s = input.service;
  if (input.slug === 'wh_game' && input.atTable) {
    const guests = Math.max(party, input.tableGuests);
    return [chargeLine({ kind: 'table', serviceId: s.id, title: TABLE_CHARGE_TITLE, unitPrice: s.unitPrice, share: party / guests })];
  }
  if (TRAINING_SLUGS.has(input.slug) && input.atTable) {
    const seats = Math.max(1, input.seats);
    const serviceShare = s.billingMode === 'per_guest' ? party : s.billingMode === 'per_pair' ? party / 2 : party / seats;
    const lines = [chargeLine({ kind: 'service', serviceId: s.id, title: s.title, unitPrice: s.unitPrice, share: Math.min(serviceShare, s.billingMode === 'per_guest' ? party : 1) })];
    if (input.table) lines.push(chargeLine({ kind: 'table', serviceId: input.table.serviceId, title: TABLE_CHARGE_TITLE, unitPrice: input.table.unitPrice, share: Math.min(1, party / seats) }));
    return lines;
  }
  const share = s.billingMode === 'per_table' ? 1 : s.billingMode === 'per_pair' ? Math.ceil(party / 2) : party;
  return [chargeLine({ kind: 'service', serviceId: s.id, title: s.title, unitPrice: s.unitPrice, share })];
}

export const sumCharges = (lines: Array<{ amount: number }>) => roundMoney(lines.reduce((sum, l) => sum + l.amount, 0));

/** «Стол делится на двоих — ваша половина»: подпись к доле стола или тренировки. */
export function shareNote(kind: 'service' | 'table', share: number): string | null {
  if (share >= 0.999) {
    if (share <= 1.001) return null;
    const n = Math.round(share * 100) / 100;
    return `${n} ${[2, 3, 4].includes(n) ? 'места' : 'мест'}`;
  }
  const n = Math.round(1 / share);
  const who = n === 2 ? 'двоих' : n === 3 ? 'троих' : n === 4 ? 'четверых' : `${n}`;
  return kind === 'table' ? `Стол на ${who} — ваша доля` : `Делится на ${who} — ваша доля`;
}

