/** Позиции счёта (20.11.2026): всегда «услуга + стол»; парная тренировка — пополам, индивидуальная — всё на одного. */
import { expect, test } from 'bun:test';
import { autoChargeLines, sumCharges } from '../src/modules/pricing/rules';

const table = { serviceId: 1, unitPrice: 1000 };
const base = { table, partySize: 1, atTable: true };

test('игра: только аренда стола; один за столом — весь стол, вдвоём — пополам', () => {
  const game = { id: 1, title: 'Игра Warhammer', unitPrice: 1000, billingMode: 'per_table' as const };
  const alone = autoChargeLines({ ...base, slug: 'wh_game', service: game, seats: 2, tableGuests: 1 });
  expect(alone).toEqual([{ kind: 'table', serviceId: 1, title: 'Аренда стола', unitPrice: 1000, share: 1, amount: 1000 }]);
  expect(sumCharges(autoChargeLines({ ...base, slug: 'wh_game', service: game, seats: 2, tableGuests: 2 }))).toBe(500);
});

test('парная тренировка: тренировка и стол пополам, даже пока второй не записался', () => {
  const lines = autoChargeLines({ ...base, slug: 'wh_group_training', service: { id: 2, title: 'Групповая тренировка', unitPrice: 1500, billingMode: 'per_pair' }, seats: 2, tableGuests: 1 });
  expect(lines.map((l) => [l.kind, l.title, l.share, l.amount])).toEqual([
    ['service', 'Групповая тренировка', 0.5, 750],
    ['table', 'Аренда стола', 0.5, 500],
  ]);
  expect(sumCharges(lines)).toBe(1250);
});

test('индивидуальная тренировка: тренировка и весь стол — на одного', () => {
  const lines = autoChargeLines({ ...base, slug: 'wh_solo_training', service: { id: 3, title: 'Индивидуальная тренировка', unitPrice: 1500, billingMode: 'per_guest' }, seats: 1, tableGuests: 1 });
  expect(lines.map((l) => [l.kind, l.share, l.amount])).toEqual([
    ['service', 1, 1500],
    ['table', 1, 1000],
  ]);
});

test('покраска и посещение — одна строка по тарифу, без стола', () => {
  const lines = autoChargeLines({ ...base, atTable: false, partySize: 2, slug: 'wh_painting', service: { id: 4, title: 'Покраска', unitPrice: 500, billingMode: 'per_guest' }, seats: 0, tableGuests: 0 });
  expect(lines).toEqual([{ kind: 'service', serviceId: 4, title: 'Покраска', unitPrice: 500, share: 2, amount: 1000 }]);
});
