import type { Service } from "@/types";

export type BoostyKind = "warhammer" | "painting";

export const boostyKindForService = (
  service?: Pick<Service, "slug"> | null,
): BoostyKind | null => {
  if (!service) return null;
  if (service.slug === "wh_painting") return "painting";
  return service.slug.startsWith("wh_") ? "warhammer" : null;
};
