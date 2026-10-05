import type { PaintingDetails, WhPlayerDetails } from "@/apiUtils/booking";

export type PlayerFormValue = {
  army: string;
  points: string;
  experienceLevel: string;
};

export const emptyPlayerForm = (): PlayerFormValue => ({
  army: "",
  points: "",
  experienceLevel: "",
});

export const playerFormFromDetails = (
  details: WhPlayerDetails | null | undefined,
): PlayerFormValue =>
  details
    ? {
        army: details.army,
        points: String(details.points),
        experienceLevel: details.experienceLevel,
      }
    : emptyPlayerForm();

export const validatePlayerForm = (
  value: PlayerFormValue,
  maxPoints: number,
): string | null => {
  if (!value.army.trim()) return "Укажите армию";
  const points = Number(value.points);
  if (!value.points || !Number.isInteger(points) || points < 1) {
    return "Укажите количество очков";
  }
  if (points > maxPoints) return `Не больше ${maxPoints} очков`;
  if (!value.experienceLevel) return "Выберите уровень опыта";
  return null;
};

export const playerFormToDetails = (value: PlayerFormValue): WhPlayerDetails => ({
  army: value.army.trim(),
  points: Number(value.points),
  experienceLevel: value.experienceLevel,
});

export type PaintingFormValue = {
  faction: string;
  model: string;
  paintSource: string;
  needsHelp: boolean | null;
  comment: string;
};

export const emptyPaintingForm = (): PaintingFormValue => ({
  faction: "",
  model: "",
  paintSource: "",
  needsHelp: null,
  comment: "",
});

export const paintingFormFromDetails = (
  details: PaintingDetails | null | undefined,
): PaintingFormValue =>
  details
    ? {
        faction: details.faction,
        model: details.model,
        paintSource: details.paintSource,
        needsHelp: details.needsHelp,
        comment: details.comment ?? "",
      }
    : emptyPaintingForm();

export const validatePaintingForm = (value: PaintingFormValue): string | null => {
  if (!value.faction.trim()) return "Укажите фракцию";
  if (!value.model.trim()) return "Укажите модель или миниатюру";
  if (!value.paintSource) return "Выберите, чьими красками будете красить";
  if (value.needsHelp === null) return "Ответьте, нужна ли помощь";
  return null;
};

export const paintingFormToDetails = (
  value: PaintingFormValue,
): PaintingDetails => ({
  faction: value.faction.trim(),
  model: value.model.trim(),
  paintSource: value.paintSource,
  needsHelp: value.needsHelp === true,
  comment: value.comment.trim() || null,
});
