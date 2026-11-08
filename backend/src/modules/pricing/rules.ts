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
