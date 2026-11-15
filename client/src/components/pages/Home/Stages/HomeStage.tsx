import NearestEventBanner from "@/components/pages/Home/NearestEventBanner";
import { useRegistrationStageStore } from "@/stores/useRegistrationStageStore";
import { getDisciplines } from "@/apiUtils/disciplines";
import { getMyReservations } from "@/apiUtils/reservations";
import { useReservationStore } from "@/stores/useReservationStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { useQuery } from "@tanstack/react-query";
import { s3Url } from "@/utils/s3utils";
import { getRosterAccess } from "@/apiUtils/roster";
import { BookOpen, ChevronRight, Swords } from "lucide-react";
import { DateTile, LimeHero, SectionLabel, Skeleton } from "@/components/ui/ds";
import { haptic } from "@/utils/haptic";
import { isInactiveReservation, sortReservationsForDisplay } from "@/utils/reservation";
import { formatTimeRange, getStatusLabel } from "@/utils/reservationDisplay";
import { isPastEvent } from "@/components/pages/Reservations/utils";
import { useNavigate } from "react-router-dom";
import { useMemo, type ReactNode } from "react";

/**
 * Главная (перестройка 15.11.2026, «кратно удобнее»):
 *  1. ближайшая запись — сразу видно, когда игра, нажатие ведёт в «Мои записи»;
 *  2. один лаймовый блок «Во что играем?» с играми внутри — запись на нужную игру в одно нажатие
 *     (раньше: кнопка «Записаться» и отдельный список услуг ниже);
 *  3. ивент — компактной карточкой, «Как играть» и WarpBuilder — двумя плитками в ряд.
 */
export default function HomeStage() {
  const { nextStage } = useRegistrationStageStore();
  const { setDisciplineId } = useReservationStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const navigate = useNavigate();

  const disciplinesQuery = useQuery({ queryKey: ["disciplines"], queryFn: getDisciplines });
  // WarpBuilder — скрытый раздел: плитка только у тех, у кого есть доступ по коду (как в профиле и боковом меню)
  const rosterAccess = useQuery({ queryKey: ["roster-access"], queryFn: getRosterAccess, retry: false });
  const reservationsQuery = useQuery({ queryKey: ["reservations"], queryFn: getMyReservations, enabled: isAuthenticated });

  const next = useMemo(() => {
    const data = reservationsQuery.data;
    if (!data) return null;
    const res = sortReservationsForDisplay(data.reservations).find((r) => !isInactiveReservation(r)) ?? null;
    const ev = data.event && !isPastEvent(data.event) ? data.event : null;
    if (ev && (!res || new Date(ev.startsAt) <= new Date(res.startsAt))) {
      return { title: ev.title, sub: "Ивент", startsAt: ev.startsAt, endsAt: ev.endsAt, tone: "lime" as const };
    }
    if (!res) return null;
    const pending = res.status.toLowerCase() === "pending";
    return {
      title: res.serviceTitle ?? "Запись",
      sub: [getStatusLabel(res.status), res.tableName].filter(Boolean).join(" · "),
      startsAt: res.startsAt,
      endsAt: res.endsAt,
      tone: pending ? ("warn" as const) : ("lime" as const),
    };
  }, [reservationsQuery.data]);

  const start = (disciplineId: number | null) => {
    haptic.tap();
    setDisciplineId(disciplineId);
    nextStage();
  };

  return (
    <div className="ds-enter relative z-[50] flex flex-col gap-5 px-5 py-3 pb-8 text-fg lg:grid lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start lg:gap-8 lg:pb-12 lg:pt-4">
      <div className="flex flex-col gap-5">
        {next && (
          <section>
            <SectionLabel>Ваша ближайшая запись</SectionLabel>
            <button
              type="button"
              onClick={() => (haptic.tap(), navigate("/reservations"))}
              className="ds-press flex w-full items-center gap-3 rounded-[18px] border border-white/10 bg-app-elevated p-3 text-left"
            >
              <DateTile date={next.startsAt} tone={next.tone} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-bold leading-tight">{next.title}</span>
                <span className="mt-1 block text-[14px] text-fg">{formatTimeRange(next.startsAt, next.endsAt)}</span>
                <span className="mt-0.5 block truncate text-[13px] text-fg-2">{next.sub}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-fg-3" />
            </button>
          </section>
        )}

        {/* запись: игры прямо в лаймовом блоке — одно нажатие до выбора времени */}
        <LimeHero kicker="Запись в клуб" title="Во что играем?" size="sm">
          <div className="grid grid-cols-2 gap-2">
            {disciplinesQuery.isLoading &&
              Array.from({ length: 4 }, (_, i) => <span key={i} className="h-[52px] rounded-[14px] bg-[#111110]/15" />)}
            {disciplinesQuery.isSuccess &&
              disciplinesQuery.data.map((discipline) => (
                <button
                  key={discipline.id}
                  type="button"
                  onClick={() => start(discipline.id)}
                  className="ds-press flex min-h-[52px] items-center gap-2.5 rounded-[14px] bg-[#111110] px-3 text-left text-fg last:odd:col-span-2"
                >
                  <img src={s3Url(`disciplines/${discipline.slug}.webp`)} alt="" className="size-6 shrink-0" />
                  <span className="min-w-0 text-[14px] font-semibold leading-tight">{discipline.title}</span>
                </button>
              ))}
          </div>
          {disciplinesQuery.isError && (
            <button type="button" onClick={() => start(null)} className="ds-press min-h-12 rounded-[14px] bg-[#111110] font-semibold text-accent">
              Записаться
            </button>
          )}
        </LimeHero>
      </div>

      <div className="flex flex-col gap-5">
        <section>
          <SectionLabel>Ближайший ивент</SectionLabel>
          <NearestEventBanner />
        </section>

        <div className={rosterAccess.data?.hasAccess ? "grid grid-cols-2 gap-2.5" : "grid grid-cols-1"}>
          <Tile icon={<BookOpen className="size-5" />} title="Как играть" sub="Первая игра без паники" onClick={() => navigate("/learn")} />
          {rosterAccess.data?.hasAccess && (
            <Tile icon={<Swords className="size-5" />} title="WarpBuilder" sub="Ростеры и игры" onClick={() => navigate("/roster")} />
          )}
        </div>
      </div>
    </div>
  );
}

function Tile({ icon, title, sub, onClick }: { icon: ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={() => (haptic.tap(), onClick())}
      className="ds-press flex min-h-[64px] items-center gap-3 rounded-[18px] border border-white/10 bg-app-elevated px-3.5 py-3 text-left"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[15px] font-bold leading-tight">{title}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-fg-2">{sub}</span>
      </span>
    </button>
  );
}
