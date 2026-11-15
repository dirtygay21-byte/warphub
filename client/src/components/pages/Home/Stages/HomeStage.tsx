import NearestEventBanner from "@/components/pages/Home/NearestEventBanner";
import { useRegistrationStageStore } from "@/stores/useRegistrationStageStore";
import { getDisciplines } from "@/apiUtils/disciplines";
import { useReservationStore } from "@/stores/useReservationStore";
import { useQuery } from "@tanstack/react-query";
import { s3Url } from "@/utils/s3utils";
import { getRosterAccess } from "@/apiUtils/roster";
import { BookOpen, Calendar, Swords } from "lucide-react";
import { LimeHero, NavRow, SectionLabel, Skeleton } from "@/components/ui/ds";
import { haptic } from "@/utils/haptic";
import { useNavigate } from "react-router-dom";

export default function HomeStage() {
  const { nextStage } = useRegistrationStageStore();
  const { setDisciplineId } = useReservationStore();

  const disciplinesQuery = useQuery({
    queryKey: ["disciplines"],
    queryFn: getDisciplines,
  });
  // WarpBuilder — скрытый раздел: карточка только у тех, у кого есть доступ по коду (как в профиле и боковом меню)
  const navigate = useNavigate();
  const rosterAccess = useQuery({ queryKey: ["roster-access"], queryFn: getRosterAccess, retry: false });

  const handleRegistartionClick = (disciplineId: number | null = null) => {
    setDisciplineId(disciplineId);
    nextStage();
  };

  return (
    <div className="ds-enter relative z-[50] flex flex-col gap-6 px-5 py-3 pb-8 text-fg lg:grid lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start lg:gap-8 lg:pb-12 lg:pt-4">
      <section className="flex flex-col gap-3">
        <SectionLabel className="mb-0">Ближайший ивент</SectionLabel>
        <div className="event-banner-glow aspect-[16/9] w-full overflow-hidden rounded-[18px]">
          <NearestEventBanner />
        </div>
        {/* «Записаться» — в потоке страницы под ивентом (A1); на компьютере — в боковой панели.
            Лаймовый концепт (15.11.2026): кнопка в лаймовом блоке с червяками — главный блок экрана. */}
        <LimeHero kicker="Запись в клуб" title="Играем?" size="sm" className="lg:hidden">
          <p className="text-[15px] leading-snug">Выберите игру, стол и время.</p>
          <button
            type="button"
            onClick={() => (haptic.tap(), handleRegistartionClick(null))}
            className="ds-press flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[#111110] text-[16px] font-semibold text-accent"
          >
            <Calendar className="size-5" />
            Записаться
          </button>
        </LimeHero>
      </section>

      <section className="flex w-full flex-col gap-3">
        <SectionLabel className="mb-0">Наши услуги</SectionLabel>

        {/* лаймовый концепт (15.11.2026): услуги — плитками по две в ряд, нечётная последняя — во всю ширину */}
        <div className="grid grid-cols-2 gap-2.5">
          {disciplinesQuery.isLoading &&
            Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[92px] rounded-[18px]" />)}
          {disciplinesQuery.isSuccess &&
            disciplinesQuery.data.map((discipline) => (
              <button
                key={discipline.id}
                type="button"
                onClick={() => (haptic.tap(), handleRegistartionClick(discipline.id))}
                className="ds-press fx-press flex min-h-[84px] flex-col justify-between gap-2.5 rounded-[18px] border border-white/10 bg-app-elevated p-3.5 text-left text-fg last:odd:col-span-2"
              >
                <span className="flex size-9 items-center justify-center rounded-[10px] bg-white/[0.08]">
                  <img src={s3Url(`disciplines/${discipline.slug}.webp`)} alt="" className="size-6" />
                </span>
                <span className="text-[16px] font-bold leading-tight">{discipline.title}</span>
              </button>
            ))}
        </div>
        <NavRow
          icon={<BookOpen className="size-5" />}
          title="Как играть"
          subtitle="Первая игра без паники: 40K, AoS, Kill Team, Warcry"
          onClick={() => navigate("/learn")}
          className="mt-1"
        />
        {rosterAccess.data?.hasAccess && (
          <NavRow
            icon={<Swords className="size-5" />}
            tone="accent"
            iconTone="solid"
            title="WarpBuilder"
            subtitle="Ростеры и игры: 40K, Age of Sigmar, Kill Team, Warcry"
            onClick={() => navigate("/roster")}
            className="mt-1"
          />
        )}
      </section>
    </div>
  );
}
