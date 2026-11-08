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
