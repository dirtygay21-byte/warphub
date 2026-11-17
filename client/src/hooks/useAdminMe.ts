import { getAdminMe, type AdminArea, type AdminMe } from "@/apiUtils/admin";
import { useQuery } from "@tanstack/react-query";

const GAME_AREAS: AdminArea[] = ["40k", "aos", "kt", "warcry"];

/**
 * Кто я в админке (17.11.2026, кураторы направлений): полный доступ или направления. Пока не загрузилось —
 * считаем полный доступ (сервер всё равно проверяет каждый запрос).
 */
export function useAdminMe() {
  const query = useQuery({ queryKey: ["admin-me"], queryFn: getAdminMe, staleTime: 5 * 60_000 });
  const me: AdminMe | undefined = query.data;
  const full = me?.full ?? true;
  const has = (...areas: AdminArea[]) => full || areas.some((a) => me!.areas.includes(a));
  return {
    me,
    full,
    has,
    hasGames: has(...GAME_AREAS),
    areaLabels: me && !me.full ? me.areas.map((a) => me.areaOptions.find((o) => o.value === a)?.label ?? a) : [],
  };
}
