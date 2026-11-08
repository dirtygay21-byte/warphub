import { describe, expect, test } from 'bun:test';
import {
  armyRentalPriceFor,
  basePriceFor,
  paymentStatus,
  roundMoney,
  totalWithDiscounts,
  validateManualDiscount,
  type PricingDiscountInput,
} from '../src/modules/pricing/rules';

describe('pricing: базовая стоимость', () => {
  test('за гостя, за стол и за пару; нечётная пара округляется вверх', () => {
    expect(basePriceFor('per_guest', 100, 3)).toBe(300);
    expect(basePriceFor('per_table', 100, 3)).toBe(100);
    expect(basePriceFor('per_pair', 100, 2)).toBe(100);
    expect(basePriceFor('per_pair', 100, 3)).toBe(200);
    expect(basePriceFor('per_pair', 100, 5)).toBe(300);
  });

  test('минимум один гость и денежное округление', () => {
    expect(basePriceFor('per_guest', 99.99, 3)).toBe(299.97);
    expect(basePriceFor('per_pair', 0, 0)).toBe(0);
    expect(roundMoney(1.005)).toBe(1.01);
  });
});

describe('pricing: аренда армии', () => {
  test('1000 очков = 1000 ₽ по стандарту, произвольные очки считаются линейно', () => {
    expect(armyRentalPriceFor(1000, 1000)).toBe(1000);
    expect(armyRentalPriceFor(1500, 1000)).toBe(1500);
    expect(armyRentalPriceFor(500, 1000)).toBe(500);
    expect(armyRentalPriceFor(0, 1000)).toBe(0);
  });

  test('тариф редактируется за 1000 очков, включая дробные значения', () => {
    expect(armyRentalPriceFor(1500, 500)).toBe(750);
    expect(armyRentalPriceFor(333, 1000.5)).toBe(333.17);
  });
});

describe('pricing: последовательные скидки', () => {
  test('третья тренировка 50% → членство 10% → код 50 ₽', () => {
    const discounts: PricingDiscountInput[] = [
      { kind: 'training', percent: 50, note: 'Третья тренировка' },
      { kind: 'membership', percent: 10, note: 'Членство' },
      { kind: 'reward', amount: 50, note: 'Код' },
    ];
    expect(totalWithDiscounts(1000, discounts)).toBe(400);
  });

  test('фиксированные скидки не дают отрицательный итог', () => {
    expect(totalWithDiscounts(100, [
      { kind: 'manual', amount: 150, note: 'Ручная' },
      { kind: 'membership', percent: 50, note: 'Членство' },
    ])).toBe(0);
    expect(totalWithDiscounts(100, [
      { kind: 'manual', percent: 100, note: 'Полная' },
      { kind: 'manual', amount: 100, note: 'Сверху' },
    ])).toBe(0);
  });

  test('порядок фиксированной и процентной скидки сохраняется', () => {
    expect(totalWithDiscounts(1000, [
      { kind: 'manual', amount: 100, note: 'Сначала' },
      { kind: 'membership', percent: 10, note: 'Потом' },
    ])).toBe(810);
    expect(totalWithDiscounts(1000, [
      { kind: 'membership', percent: 10, note: 'Сначала' },
      { kind: 'manual', amount: 100, note: 'Потом' },
    ])).toBe(800);
  });
});

describe('pricing: статус оплаты', () => {
  test('бесплатно, не оплачено, частично и полностью', () => {
    expect(paymentStatus(0, 0)).toBe('free');
    expect(paymentStatus(100, 0)).toBe('unpaid');
    expect(paymentStatus(100, 40)).toBe('partial');
    expect(paymentStatus(100, 100)).toBe('paid');
  });
});

describe('pricing: ручная скидка', () => {
  const valid: PricingDiscountInput = { kind: 'membership', percent: 10, note: 'Членство' };

  test('нужен ровно один размер и непустая причина', () => {
    expect(() => validateManualDiscount(valid)).not.toThrow();
    expect(() => validateManualDiscount({ ...valid, percent: null, amount: null })).toThrow('либо процент');
    expect(() => validateManualDiscount({ ...valid, amount: 10 })).toThrow('либо процент');
    expect(() => validateManualDiscount({ ...valid, note: ' ' })).toThrow('причину');
  });

  test('процент ограничен 0–100, сумма неотрицательна', () => {
    expect(() => validateManualDiscount({ ...valid, percent: 101 })).toThrow('от 0 до 100');
    expect(() => validateManualDiscount({ ...valid, percent: null, amount: -1 })).toThrow('отрицательной');
  });
});
