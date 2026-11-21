import { apiRequest } from "@/apiUtils/general";

export type BillingMode = "per_guest" | "per_table" | "per_pair";
export type PriceVariant = "standard" | "own_materials" | "club_materials";
export type PaymentMethod = "cash" | "card" | "transfer" | "other";

export type ServicePrice = {
  id: number;
  slug: string;
  title: string | null;
  billingMode: BillingMode;
  unitPrice: number;
  armyRentalPricePer1000: number;
  ownMaterialsPrice: number;
  clubMaterialsPrice: number;
  thirdGameDiscountPercent: number;
  effectiveFrom: string | null;
};

export type PublicServicePricing = {
  serviceId: number;
  billingMode: BillingMode;
  unitPrice: number;
  armyRentalPricePer1000: number;
  ownMaterialsPrice: number;
  clubMaterialsPrice: number;
  thirdGameDiscountPercent: number;
};

export type ReservationDiscount = {
  id: string;
  reservationId: string;
  kind: "training" | "membership" | "reward" | "manual";
  percent: number | null;
  amount: number | null;
  rewardId: string | null;
  note: string;
  createdAt: string;
};

export type ReservationPayment = {
  id: string;
  reservationId: string;
  amount: number;
  method: PaymentMethod;
  note: string | null;
  createdAt: string;
};

export type ReservationPricing = {
  reservationId: string;
  serviceSlug: string;
  billingMode: BillingMode;
  priceVariant: PriceVariant;
  unitPrice: number;
  baseAmount: number;
  armyRentalPoints: number;
  armyRentalPricePer1000: number;
  armyRentalAmount: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  trainingGamesUsed: number;
  trainingGamesRemaining: number;
  status: "free" | "unpaid" | "partial" | "paid";
  /** оплачено больше суммы счёта (после пересчёта доли стола) */
  overpaidAmount?: number;
  /** позиции счёта (20.11.2026): услуга и аренда стола; у старых счетов — пусто */
  charges?: ReservationCharge[];
  /** позиции поправил администратор */
  chargesEdited?: boolean;
  /** игрок отметил «я член клуба» в «Моих записях» (21.11.2026) */
  membershipRequestedAt?: string | null;
  discounts: ReservationDiscount[];
  payments: ReservationPayment[];
};

export type ReservationCharge = {
  id: string;
  kind: "service" | "table";
  serviceId: number | null;
  title: string;
  unitPrice: number;
  share: number;
  amount: number;
  auto: boolean;
};

export type ChargeCatalogItem = { id: string; kind: "service" | "table"; serviceId: number | null; title: string; unitPrice: number };

export const getChargeCatalog = () => apiRequest<ChargeCatalogItem[]>("/admin/pricing/charge-catalog");

export const setAdminReservationCharges = (reservationId: string, lines: Array<{ catalogId: string; share: number }>) =>
  apiRequest<ReservationPricing>(`/admin/reservations/${reservationId}/charges`, { method: "PUT", body: JSON.stringify({ lines }) });

export const resetAdminReservationCharges = (reservationId: string) =>
  apiRequest<ReservationPricing>(`/admin/reservations/${reservationId}/charges/reset`, { method: "POST" });

export const BILLING_MODE_LABELS: Record<BillingMode, string> = {
  per_guest: "За гостя",
  per_table: "За стол / запись",
  per_pair: "За пару гостей",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Наличные",
  card: "Карта",
  transfer: "Перевод",
  other: "Другое",
};

export const getServicePricing = (serviceId: number) =>
  apiRequest<PublicServicePricing>(`/services/${serviceId}/pricing`);

export const getAdminServicePrices = () =>
  apiRequest<ServicePrice[]>("/admin/pricing/services");

export const saveAdminServicePrice = (
  serviceId: number,
  payload: {
    billingMode: BillingMode;
    unitPrice: number;
    armyRentalPricePer1000?: number;
    ownMaterialsPrice?: number;
    clubMaterialsPrice?: number;
    thirdGameDiscountPercent?: number;
  },
) =>
  apiRequest<unknown>(`/admin/pricing/services/${serviceId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const getAdminReservationPricing = (reservationId: string) =>
  apiRequest<ReservationPricing>(`/admin/reservations/${reservationId}/pricing`);

export const addAdminReservationDiscount = (
  reservationId: string,
  payload: {
    kind: "membership" | "manual";
    percent?: number;
    amount?: number;
    note: string;
  },
) =>
  apiRequest<ReservationPricing>(`/admin/reservations/${reservationId}/discounts`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const applyAdminTrainingGame = (reservationId: string) =>
  apiRequest<ReservationPricing>(`/admin/reservations/${reservationId}/training-game`, {
    method: "POST",
  });

export const applyAdminReservationReward = (reservationId: string, code: string) =>
  apiRequest<ReservationPricing>(`/admin/reservations/${reservationId}/reward`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });

export const removeAdminReservationDiscount = (discountId: string) =>
  apiRequest<ReservationPricing>(`/admin/reservations/discounts/${discountId}`, {
    method: "DELETE",
  });

export const addAdminReservationPayment = (
  reservationId: string,
  payload: { amount: number; method: PaymentMethod; note?: string },
) =>
  apiRequest<ReservationPricing>(`/admin/reservations/${reservationId}/payments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

/** Счёт игрока в «Моих записях» (21.11.2026): только после записи и только свой. */
export type PlayerBill =
  | { reservationId: string; cancelled: true }
  | {
      reservationId: string;
      cancelled: false;
      status: ReservationPricing["status"];
      lines: Array<{ title: string; unitPrice: number; share: number; amount: number; note: string | null }>;
      army: { points: number; amount: number } | null;
      subtotal: number;
      discounts: Array<{ id: string; kind: string; title: string; note: string | null; percent: number | null; amount: number | null }>;
      totalAmount: number;
      paidAmount: number;
      remainingAmount: number;
      overpaidAmount: number;
      offers: {
        canApply: boolean;
        training: { eligible: boolean; applied: boolean; remaining: number; limit: number };
        membership: { percent: number; applied: boolean; requested: boolean };
        rewards: Array<{ code: string; label: string; percent: number | null; amount: number | null; expiresAt: string }>;
      };
    };

export const getMyBill = (reservationId: string) => apiRequest<PlayerBill>(`/reservations/${reservationId}/bill`);
export const applyMyTraining = (reservationId: string) => apiRequest<PlayerBill>(`/reservations/${reservationId}/bill/training`, { method: "POST" });
export const applyMyReward = (reservationId: string, code: string) =>
  apiRequest<PlayerBill>(`/reservations/${reservationId}/bill/reward`, { method: "POST", body: JSON.stringify({ code }) });
export const requestMyMembership = (reservationId: string) => apiRequest<PlayerBill>(`/reservations/${reservationId}/bill/membership`, { method: "POST" });
