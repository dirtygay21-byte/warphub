import {
  experienceLabelOf,
  isPaintingDetails,
  isWhPlayerDetails,
  type ReservationDetails,
} from "@/apiUtils/booking";
import { useBookingOptions } from "@/hooks/useBookingOptions";
import { Brush, HelpCircle, Medal, Palette, Shield, Swords } from "lucide-react";
import { DetailRow } from "./DetailRow";

/** Строки с армией/очками/опытом или данными покраски */
export function BookingDetailsRows({
  details,
}: {
  details: ReservationDetails | null | undefined;
}) {
  const options = useBookingOptions();

  if (isWhPlayerDetails(details)) {
    return (
      <>
        <DetailRow
          icon={<Shield className="size-4" />}
          label="Армия"
          value={details.army}
          isLoading={false}
        />
        <DetailRow
          icon={<Swords className="size-4" />}
          label="Очки"
          value={String(details.points)}
          isLoading={false}
        />
        <DetailRow
          icon={<Medal className="size-4" />}
          label="Опыт"
          value={experienceLabelOf(options, details.experienceLevel)}
          isLoading={false}
        />
      </>
    );
  }

  if (isPaintingDetails(details)) {
    return (
      <>
        <DetailRow
          icon={<Shield className="size-4" />}
          label="Фракция"
          value={details.faction}
          isLoading={false}
        />
        <DetailRow
          icon={<Brush className="size-4" />}
          label="Модель"
          value={details.model}
          isLoading={false}
        />
        <DetailRow
          icon={<Palette className="size-4" />}
          label="Краски"
          value={
            options.paintSources.find((s) => s.value === details.paintSource)
              ?.label ?? details.paintSource
          }
          isLoading={false}
        />
        <DetailRow
          icon={<HelpCircle className="size-4" />}
          label="Помощь"
          value={details.needsHelp ? "Нужна" : "Не нужна"}
          isLoading={false}
        />
      </>
    );
  }

  return null;
}
