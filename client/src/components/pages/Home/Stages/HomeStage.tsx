import NearestEventBanner from "@/components/pages/Home/NearestEventBanner";
import { useRegistrationStageStore } from "@/stores/useRegistrationStageStore";
import { getDisciplines } from "@/apiUtils/disciplines";
import { useReservationStore } from "@/stores/useReservationStore";
import { useQuery } from "@tanstack/react-query";
import { s3Url } from "@/utils/s3utils";
import { getRosterAccess } from "@/apiUtils/roster";
import { BookOpen, Calendar, Swords } from "lucide-react";
import { DsButton, NavRow, Skeleton } from "@/components/ui/ds";
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
    <div className="ds-enter relative z-[50] flex flex-col gap-8 px-5 py-3 pb-8 text-fg lg:grid lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start lg:gap-8 lg:pb-12 lg:pt-4">
      <section className="flex flex-col gap-3">
        <SectionTitle>Ближайший ивент</SectionTitle>
        <div className="event-banner-glow aspect-[16/9] w-full overflow-hidden rounded-[18px]">
          <NearestEventBanner />
        </div>
        {/* «Записаться» — в потоке страницы под ивентом (A1); на компьютере — в боковой панели */}
        <DsButton variant="primary" size="lg" onClick={() => handleRegistartionClick(null)} className="register-btn-glow w-full lg:hidden">
          <Calendar className="size-5" />
          Записаться
        </DsButton>
      </section>

      <section className="flex w-full flex-col gap-3">
        <SectionTitle>Наши услуги</SectionTitle>

        <div className="flex flex-col gap-2.5 md:grid md:grid-cols-2 lg:flex">
          {disciplinesQuery.isLoading &&
            Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[68px] rounded-[18px]" />)}
          {disciplinesQuery.isSuccess &&
            disciplinesQuery.data.map((discipline) => (
              <NavRow
                key={discipline.id}
                icon={<img src={s3Url(`disciplines/${discipline.slug}.webp`)} alt="" className="size-7" />}
                iconTone="neutral"
                title={discipline.title}
                onClick={() => handleRegistartionClick(discipline.id)}
              />
            ))}
        </div>
        <NavRow
          icon={<BookOpen className="size-5" />}
          title="Как играть"
          subtitle="Первая игра без паники: Warhammer 40,000"
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

/** Заголовок блока главной (Oswald, заглавные). */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-xl font-semibold uppercase leading-none text-fg">{children}</h2>;
}
