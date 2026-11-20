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
  discounts: ReservationDiscount[];
  payments: ReservationPayment[];
};

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
