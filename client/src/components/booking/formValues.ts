import { gameHasPoints } from "@/apiUtils/booking";
import type { PaintingDetails, WhGame, WhPlayerDetails } from "@/apiUtils/booking";

export type PlayerFormValue = {
  game: WhGame;
  army: string;
  points: string;
  experienceLevel: string;
  /** тренировка: «хочу поиграть за…» (21.11.2026) */
  comment: string;
};

export const emptyPlayerForm = (game: WhGame = "40k"): PlayerFormValue => ({
  game,
  army: "",
  points: "",
  experienceLevel: "",
  comment: "",
});

export const playerFormFromDetails = (
  details: WhPlayerDetails | null | undefined,
): PlayerFormValue =>
  details
    ? {
        game: details.game ?? "40k",
        army: details.army,
        points: details.points != null ? String(details.points) : "",
        experienceLevel: details.experienceLevel,
        comment: details.comment ?? "",
      }
    : emptyPlayerForm();

export const validatePlayerForm = (
  value: PlayerFormValue,
  maxPoints: number,
  /** тренировка (21.11.2026): армию не выбирают — только опыт; ростер из WarpBuilder — по желанию */
  training = false,
): string | null => {
  if (training) {
    if (value.comment.length > 300) return "Пожелание — не длиннее 300 символов";
    return value.experienceLevel ? null : "Выберите уровень опыта";
  }
  if (!value.army.trim()) return value.game === "kt" ? "Укажите команду" : value.game === "warcry" ? "Укажите варбанду" : "Укажите армию";
  // у Kill Team и Warcry очков нет (15.11.2026)
  if (gameHasPoints(value.game)) {
    const points = Number(value.points);
    if (!value.points || !Number.isInteger(points) || points < 1) {
      return "Укажите количество очков";
    }
    if (points > maxPoints) return `Не больше ${maxPoints} очков`;
  }
  if (!value.experienceLevel) return "Выберите уровень опыта";
  return null;
};

export const playerFormToDetails = (value: PlayerFormValue, training = false): WhPlayerDetails => ({
  game: value.game,
  army: value.army.trim(),
  points: gameHasPoints(value.game) && (!training || value.points) ? Number(value.points) : null,
  experienceLevel: value.experienceLevel,
  ...(training && value.comment.trim() ? { comment: value.comment.trim() } : {}),
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
