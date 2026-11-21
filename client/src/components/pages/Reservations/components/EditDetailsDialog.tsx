import {
  detailsKindForSlug,
  isPaintingDetails,
  isWhPlayerDetails,
  updateBookingDetails,
} from "@/apiUtils/booking";
import { PaintingForm, PlayerInfoForm } from "@/components/booking/PlayerForms";
import {
  paintingFormFromDetails,
  paintingFormToDetails,
  playerFormFromDetails,
  playerFormToDetails,
  validatePaintingForm,
  validatePlayerForm,
} from "@/components/booking/formValues";
import { useBookingOptions } from "@/hooks/useBookingOptions";
import type { Reservation } from "@/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, PencilLine } from "lucide-react";
import { useState } from "react";
import { useDialogExit } from "@/components/ui/ds/useDialogExit";
import { toast } from "@/stores/useToastStore";

/** Изменение армии/очков/опыта или формы покраски до начала записи */
export function EditDetailsDialog({
  reservation,
  onClose,
}: {
  reservation: Reservation;
  onClose: () => void;
}) {
  const options = useBookingOptions();
  const queryClient = useQueryClient();
  const kind = detailsKindForSlug(reservation.serviceSlug);
  // тренировки (21.11.2026): без выбора армии — пожелание и ростер из WarpBuilder
  const training = reservation.serviceSlug === "wh_group_training" || reservation.serviceSlug === "wh_solo_training";
  const [player, setPlayer] = useState(() =>
    playerFormFromDetails(
      isWhPlayerDetails(reservation.details) ? reservation.details : null,
    ),
  );
  const [painting, setPainting] = useState(() =>
    paintingFormFromDetails(
      isPaintingDetails(reservation.details) ? reservation.details : null,
    ),
  );
  const [showErrors, setShowErrors] = useState(false);

  const validationError =
    kind === "wh_player"
      ? validatePlayerForm(player, options.maxPoints, training)
      : kind === "painting"
        ? validatePaintingForm(painting)
        : null;

  const mutation = useMutation({
    mutationFn: () =>
      updateBookingDetails(
        reservation.id,
        kind === "wh_player"
          ? playerFormToDetails(player, training)
          : paintingFormToDetails(painting),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["service-availability"] });
      toast.success("Данные записи обновлены");
      onClose();
    },
  });

  const leaving = useDialogExit();

  return (
    <div
      className={`ds-fade fixed inset-0 z-50 flex items-end justify-center bg-overlay/70 px-4 pb-6 pt-10 sm:items-center${leaving ? " ds-leaving" : ""}`}
      onClick={() => !mutation.isPending && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-details-title"
        className="ds-sheet max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-app-elevated p-5 text-white shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="edit-details-title"
          className="mb-4 flex items-center gap-2 text-lg font-semibold"
        >
          <PencilLine className="size-5 text-accent" />
          Изменить данные записи
        </h2>

        {kind === "wh_player" && (
          <PlayerInfoForm value={player} onChange={setPlayer} options={options} lockedGame={player.game} training={training} />
        )}
        {kind === "painting" && (
          <PaintingForm value={painting} onChange={setPainting} options={options} />
        )}

        {showErrors && validationError && (
          <div className="mt-4 rounded-xl border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {validationError}
          </div>
        )}
        {mutation.isError && (
          <div className="mt-4 rounded-xl border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {mutation.error.message}
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            className="flex-1 rounded-xl border border-white/15 bg-white/3 px-4 py-3 text-sm font-semibold text-white active:bg-white/10"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => {
              setShowErrors(true);
              if (!validationError) mutation.mutate();
            }}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground active:scale-95 disabled:opacity-60"
          >
            {mutation.isPending && <LoaderCircle className="size-4 animate-spin" />}
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
