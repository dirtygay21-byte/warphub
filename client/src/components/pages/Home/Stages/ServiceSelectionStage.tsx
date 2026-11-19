import { useRegistrationStageStore } from "@/stores/useRegistrationStageStore";
import type { Service } from "@/types";
import { ChevronRightIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getDisciplines, getServices } from "@/apiUtils/disciplines";
import { useReservationStore } from "@/stores/useReservationStore";
import { s3Url } from "@/utils/s3utils";
import DndSection from "../Dnd/DndSection";
import { CalendarDays, Clock3, Sparkles, UsersRound } from "lucide-react";
import { NavRow, Skeleton } from "@/components/ui/ds";
import { Ticket } from "@/components/booking/Ticket";
import { serviceFacts } from "@/components/booking/serviceFacts";
import BoostySubscriptionInfo from "@/components/booking/BoostySubscriptionInfo";
import { boostyKindForService } from "@/components/booking/boosty";

const DND_SLUG = "dnd";

export default function ServiceSelectionStage() {
  const { disciplineId, dndInitialView } = useReservationStore();

  const disciplinesQuery = useQuery({
    queryKey: ["disciplines"],
    queryFn: getDisciplines,
  });

  const disciplines = disciplinesQuery.data ?? [];
  const selectedDiscipline = disciplines.find((d) => d.id === disciplineId);

  // D&D устроен иначе: заявка «Хочу попробовать» и игры по расписанию
  if (selectedDiscipline?.slug === DND_SLUG) {
    return <DndSection initialView={dndInitialView} />;
  }

  const disciplineIds = disciplineId
    ? [disciplineId]
    : disciplines.map((discipline) => discipline.id);

  return (
    <div className="ds-enter h-full w-full space-y-5 px-5 py-3 text-fg">
      {disciplineIds.map((id) => (
        <ServiceBlock key={id} disciplineId={id} />
      ))}
    </div>
  );
}

function ServiceBlock({ disciplineId }: { disciplineId: number }) {
  const { nextStage } = useRegistrationStageStore();
  const { setDisciplineId, setServiceId, setDndInitialView } =
    useReservationStore();

  const disciplinesQuery = useQuery({
    queryKey: ["disciplines"],
    queryFn: getDisciplines,
  });

  const servicesQuery = useQuery({
    queryKey: ["services", disciplineId],
    queryFn: () => getServices(disciplineId),
  });

  const discipline = disciplinesQuery.data?.find(
    (item) => item.id === disciplineId,
  );
  const title = discipline?.title ?? "";
  const services = servicesQuery.data ?? [];

  if (disciplinesQuery.isLoading || servicesQuery.isLoading) {
    return (
      <div aria-busy="true" aria-label="Загружаем услуги">
        <Skeleton className="mb-3 h-5 w-36" />
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[190px] rounded-[20px]" />
          ))}
        </div>
      </div>
    );
  }

  if (discipline?.slug === DND_SLUG) {
    const openDnd = (view: "home" | "trial") => {
      setDisciplineId(disciplineId);
      setDndInitialView(view);
    };

    return (
      <div>
        <h2 className="mb-3 font-display text-xl font-semibold uppercase leading-none">{title}</h2>
        <ul className="ds-stagger flex flex-col gap-2">
          <DndEntryItem
            icon={<Sparkles className="size-5" />}
            title="Хочу попробовать"
            description="Заявка без даты — подберём группу и игру"
            onClick={() => openDnd("trial")}
          />
          <DndEntryItem
            icon={<CalendarDays className="size-5" />}
            title="Игры по расписанию"
            description="Запись на конкретную игру с датой и временем"
            onClick={() => openDnd("home")}
          />
        </ul>
      </div>
    );
  }

  const handleServiceClick = (service: Service) => {
    setDisciplineId(service.disciplineId);
    setServiceId(service.id);
    nextStage();
  };

  return (
    <div>
      <h2 className="mb-3 font-display text-xl font-semibold uppercase leading-none">{title}</h2>
      <ul className="ds-stagger flex flex-col gap-4">
        {services.map((service) => (
          <ServiceItemComponent
            key={service.id}
            service={service}
            imgUrl={s3Url(`services/${service.slug}.webp`)}
            onClick={() => handleServiceClick(service)}
          />
        ))}
      </ul>
    </div>
  );
}

/** Услуга — билет (17.11.2026): большое фото сверху, название и описание; корешок — часы и люди из настроек услуги. */
function ServiceItemComponent({
  service,
  imgUrl,
  onClick,
}: {
  service: Service;
  imgUrl: string;
  onClick: () => void;
}) {
  const boostyKind = boostyKindForService(service);
  const { hours, people } = serviceFacts(service);

  return (
    <li className="relative">
      <Ticket
        image={imgUrl}
        imageHeight={112}
        onClick={onClick}
        ariaLabel={service.title}
        stubWidth={92}
        stub={
          <span className="flex flex-col items-center gap-3">
            {hours && <StubFact icon={<Clock3 className="size-4" />} value={hours.value} note={hours.note} />}
            {people && <StubFact icon={<UsersRound className="size-4" />} value={people.value} note={people.note} />}
            {!hours && !people && <ChevronRightIcon className="size-5 text-fg-3" />}
          </span>
        }
      >
        <span className="block text-base font-extrabold leading-tight">{service.title}</span>
        {service.description && <span className="mt-1 block text-sm leading-snug text-fg-2">{service.description}</span>}
      </Ticket>
      {boostyKind && (
        <div className="absolute top-2" style={{ right: 100 }}>
          <BoostySubscriptionInfo kind={boostyKind} context="selection" className="bg-black/55 text-fg backdrop-blur-sm" />
        </div>
      )}
    </li>
  );
}

function StubFact({ icon, value, note }: { icon: React.ReactNode; value: string; note: string }) {
  return (
    <span className="flex flex-col items-center">
      <span className="text-fg-3">{icon}</span>
      <span className="mt-1 font-display text-[20px] font-bold leading-none tabular-nums">{value}</span>
      <span className="mt-0.5 text-[11.5px] text-fg-3">{note}</span>
    </span>
  );
}

function DndEntryItem({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <li>
      <NavRow icon={icon} title={title} subtitle={description} onClick={onClick} />
    </li>
  );
}
