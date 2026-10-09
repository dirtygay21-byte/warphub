import { useRegistrationStageStore } from "@/stores/useRegistrationStageStore";
import type { Service } from "@/types";
import { ChevronRightIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getDisciplines, getServices } from "@/apiUtils/disciplines";
import { useReservationStore } from "@/stores/useReservationStore";
import { s3Url } from "@/utils/s3utils";
import DndSection from "../Dnd/DndSection";
import { CalendarDays, Sparkles } from "lucide-react";

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
    <div className="w-full h-full text-white px-6 py-3 space-y-6">
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

  if (discipline?.slug === DND_SLUG) {
    const openDnd = (view: "home" | "trial") => {
      setDisciplineId(disciplineId);
      setDndInitialView(view);
    };

    return (
      <div>
        <h2 className="text-2xl font-medium mb-2">{title}</h2>
        <ul className="flex flex-col gap-2">
          <DndEntryItem
            icon={<Sparkles className="size-6 text-accent" />}
            title="Хочу попробовать"
            description="Заявка без даты — подберём группу и игру"
            onClick={() => openDnd("trial")}
          />
          <DndEntryItem
            icon={<CalendarDays className="size-6 text-accent" />}
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
      <h2 className="text-2xl font-medium mb-2">{title}</h2>
      <ul className="flex flex-col gap-2">
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

function ServiceItemComponent({
  service,
  imgUrl,
  onClick,
}: {
  service: Service;
  imgUrl: string;
  onClick: () => void;
}) {
  return (
    <li
      className="flex items-center gap-2 rounded-md bg-app-subtle px-2 py-2 transition-colors hover:cursor-pointer hover:bg-white/[0.05]"
      onClick={onClick}
    >
      <img
        src={imgUrl}
        alt=""
        className="h-[4rem] w-[7rem] mr-3 rounded-[1vw] object-cover"
      />

      <div className="">
        <h3 className="text-md font-medium leading-4 mb-1">{service.title}</h3>
        <span className="text-xs text-subtle w-[75%] block pt-2">
          {service.description}
        </span>
        {service.visitorsCapacity && (
          <p className="text-xs text-subtle">
            до {service.visitorsCapacity} чел.
          </p>
        )}
      </div>
      <ChevronRightIcon className="size-6 text-white ml-auto" />
    </li>
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
    <li
      className="flex items-center gap-3 rounded-md bg-app-subtle px-3 py-3 transition-colors hover:cursor-pointer hover:bg-white/[0.05]"
      onClick={onClick}
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-accent/10">
        {icon}
      </span>
      <div>
        <h3 className="text-md font-medium leading-4 mb-1">{title}</h3>
        <span className="text-xs text-subtle block">{description}</span>
      </div>
      <ChevronRightIcon className="size-6 text-white ml-auto" />
    </li>
  );
}
