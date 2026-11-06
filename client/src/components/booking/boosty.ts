import type { Service } from "@/types";

export type BoostyKind = "warhammer" | "painting";

export const BOOSTY_GENERAL_URL = "https://boosty.to/wbg";
export const BOOSTY_SUBSCRIPTION_URL = "https://boosty.to/wbg/purchase/4156906?ssource=DIRECT&share=subscription_link";

export const boostyKindForService = (
  service?: Pick<Service, "slug"> | null,
): BoostyKind | null => {
  if (!service) return null;
  if (service.slug === "wh_painting") return "painting";
  return service.slug.startsWith("wh_") ? "warhammer" : null;
};
