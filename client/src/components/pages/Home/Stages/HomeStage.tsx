import NearestEventBanner from "@/components/pages/Home/NearestEventBanner";
import { useRegistrationStageStore } from "@/stores/useRegistrationStageStore";
import { getDisciplines } from "@/apiUtils/disciplines";
import { useReservationStore } from "@/stores/useReservationStore";
import { useQuery } from "@tanstack/react-query";
import { s3Url } from "@/utils/s3utils";

export default function HomeStage() {
  const { nextStage } = useRegistrationStageStore();
  const { setDisciplineId } = useReservationStore();

  const disciplinesQuery = useQuery({
    queryKey: ["disciplines"],
    queryFn: getDisciplines,
  });

  const handleRegistartionClick = (disciplineId: number | null = null) => {
    setDisciplineId(disciplineId);
    nextStage();
  };

  return (
    <>
      <div className="relative z-[50] flex flex-col space-y-12 px-4 py-3 pb-28 lg:grid lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start lg:gap-8 lg:space-y-0 lg:pb-12 lg:pt-4">
        <section className="space-y-3">
          <h2 className="text-2xl font-semibold text-white">Ближайший ивент</h2>
          <div className="event-banner-glow aspect-[5/3] w-full overflow-hidden rounded-xl">
            <NearestEventBanner />
          </div>
        </section>

        <section className="flex w-full flex-col gap-3 text-white">
          <h2 className="text-2xl font-semibold">Наши услуги</h2>

          <div className="flex flex-col gap-2 md:grid md:grid-cols-2 lg:flex">
            {disciplinesQuery.isSuccess &&
              disciplinesQuery.data.map((discipline) => (
                <QuickSelectionButton
                  key={discipline.id}
                  imageUrl={s3Url(`disciplines/${discipline.slug}.webp`)}
                  onClick={() => handleRegistartionClick(discipline.id)}
                >
                  {discipline.title}
                </QuickSelectionButton>
              ))}
          </div>
        </section>
      </div>
    </>
  );
}

function QuickSelectionButton({
  children,
  onClick,
  imageUrl,
}: {
  children: React.ReactNode;
  onClick: () => void;
  imageUrl: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-start gap-2 rounded-xl bg-app-subtle px-4 py-3.5 text-lg font-medium text-white transition-all duration-300 active:scale-95 active:border-accent/70 hover:cursor-pointer hover:bg-white/[0.06] hover:ring-1 hover:ring-accent/40"
    >
      <img src={imageUrl} alt={""} className="mr-1 size-7" />
      {children}
    </button>
  );
}
