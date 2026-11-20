import { relations, sql } from 'drizzle-orm';
import { boolean, check, doublePrecision, index, integer, pgTable, serial, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { servicesTable } from './services';
import { reservationsTable } from './reservations';
import { usersTable } from './users';
import { minigameRewardsTable } from './minigames';

export const pricingBillingModes = ['per_guest', 'per_table', 'per_pair'] as const;
export type PricingBillingMode = (typeof pricingBillingModes)[number];
export const pricingPriceVariants = ['standard', 'own_materials', 'club_materials'] as const;
export type PricingPriceVariant = (typeof pricingPriceVariants)[number];

export const servicePricesTable = pgTable(
  'service_prices',
  {
    id: serial('id').primaryKey(),
    serviceId: integer('service_id')
      .notNull()
      .references(() => servicesTable.id, { onDelete: 'cascade' }),
    billingMode: varchar('billing_mode', { enum: pricingBillingModes }).notNull(),
    unitPrice: doublePrecision('unit_price').notNull(),
    armyRentalPricePer1000: doublePrecision('army_rental_price_per_1000').notNull().default(1000),
    ownMaterialsPrice: doublePrecision('own_materials_price').notNull().default(0),
    clubMaterialsPrice: doublePrecision('club_materials_price').notNull().default(0),
    thirdGameDiscountPercent: doublePrecision('third_game_discount_percent').notNull().default(0),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
    createdBy: uuid('created_by').references(() => usersTable.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('service_prices_service_effective_index').on(table.serviceId, table.effectiveFrom)],
);

export const reservationPricingTable = pgTable('reservation_pricing', {
  reservationId: uuid('reservation_id')
    .primaryKey()
    .references(() => reservationsTable.id, { onDelete: 'cascade' }),
  billingMode: varchar('billing_mode', { enum: pricingBillingModes }).notNull(),
  priceVariant: varchar('price_variant', { enum: pricingPriceVariants }).notNull().default('standard'),
  unitPrice: doublePrecision('unit_price').notNull(),
  baseAmount: doublePrecision('base_amount').notNull(),
  armyRentalPoints: integer('army_rental_points').notNull().default(0),
  armyRentalPricePer1000: doublePrecision('army_rental_price_per_1000').notNull().default(0),
  armyRentalAmount: doublePrecision('army_rental_amount').notNull().default(0),
  totalAmount: doublePrecision('total_amount').notNull(),
  /** счёт по позициям (reservation_charges): база = сумма позиций (20.11.2026); false — старый счёт по тарифу */
  itemized: boolean('itemized').notNull().default(false),
  paidAmount: doublePrecision('paid_amount').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
});

/**
 * Позиции счёта (20.11.2026): услуга и аренда стола. share — доля этой записи (½ — пополам за парной тренировкой,
 * 2 — два места по цене за человека), amount = unitPrice × share. auto = false — поправлено администратором.
 */
export const reservationChargeKinds = ['service', 'table'] as const;
export type ReservationChargeKind = (typeof reservationChargeKinds)[number];
export const reservationChargesTable = pgTable(
  'reservation_charges',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    reservationId: uuid('reservation_id')
      .notNull()
      .references(() => reservationsTable.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { enum: reservationChargeKinds }).notNull(),
    serviceId: integer('service_id').references(() => servicesTable.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    unitPrice: doublePrecision('unit_price').notNull(),
    share: doublePrecision('share').notNull().default(1),
    amount: doublePrecision('amount').notNull(),
    auto: boolean('auto').notNull().default(true),
    position: integer('position').notNull().default(0),
    createdBy: uuid('created_by').references(() => usersTable.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('reservation_charges_reservation_index').on(table.reservationId, table.position),
    check('reservation_charges_kind_check', sql`${table.kind} IN ('service', 'table')`),
  ],
);

export const reservationDiscountsTable = pgTable(
  'reservation_discounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    reservationId: uuid('reservation_id')
      .notNull()
      .references(() => reservationsTable.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { enum: ['training', 'membership', 'reward', 'manual'] }).notNull(),
    percent: doublePrecision('percent'),
    amount: doublePrecision('amount'),
    rewardId: uuid('reward_id').references(() => minigameRewardsTable.id, { onDelete: 'set null' }),
    note: text('note').notNull(),
    createdBy: uuid('created_by').references(() => usersTable.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('reservation_discounts_reservation_index').on(table.reservationId),
    uniqueIndex('reservation_discounts_reward_unique').on(table.rewardId),
  ],
);

export const reservationPaymentsTable = pgTable(
  'reservation_payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    reservationId: uuid('reservation_id')
      .notNull()
      .references(() => reservationsTable.id, { onDelete: 'cascade' }),
    amount: doublePrecision('amount').notNull(),
    method: varchar('method', { enum: ['cash', 'card', 'transfer', 'other'] }).notNull(),
    note: text('note'),
    createdBy: uuid('created_by').references(() => usersTable.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('reservation_payments_reservation_index').on(table.reservationId, table.createdAt)],
);

export const servicePriceRelations = relations(servicePricesTable, ({ one }) => ({
  service: one(servicesTable, { fields: [servicePricesTable.serviceId], references: [servicesTable.id] }),
  createdBy: one(usersTable, { fields: [servicePricesTable.createdBy], references: [usersTable.id] }),
}));

export const reservationPricingRelations = relations(reservationPricingTable, ({ one }) => ({
  reservation: one(reservationsTable, { fields: [reservationPricingTable.reservationId], references: [reservationsTable.id] }),
}));

export const reservationDiscountRelations = relations(reservationDiscountsTable, ({ one }) => ({
  reservation: one(reservationsTable, { fields: [reservationDiscountsTable.reservationId], references: [reservationsTable.id] }),
  reward: one(minigameRewardsTable, { fields: [reservationDiscountsTable.rewardId], references: [minigameRewardsTable.id] }),
  createdBy: one(usersTable, { fields: [reservationDiscountsTable.createdBy], references: [usersTable.id] }),
}));

export const reservationPaymentRelations = relations(reservationPaymentsTable, ({ one }) => ({
  reservation: one(reservationsTable, { fields: [reservationPaymentsTable.reservationId], references: [reservationsTable.id] }),
  createdBy: one(usersTable, { fields: [reservationPaymentsTable.createdBy], references: [usersTable.id] }),
}));
