import type { BookingOptions } from "@/apiUtils/booking";
import type { PaintingFormValue, PlayerFormValue } from "./formValues";
import clsx from "clsx";
import { useState } from "react";
import {
  ChoiceChips,
  Field,
  inputClassName,
  YesNoChips,
} from "./FormControls";

const OTHER_FACTION = "__other__";

/** Фракция: список из справочника + «Другая» со своим вариантом */
export function FactionInput({
  factions,
  value,
  onChange,
  placeholder = "Выберите фракцию",
}: {
  factions: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const isKnown = value === "" || factions.includes(value);
  const [custom, setCustom] = useState(!isKnown);

  return (
    <div className="space-y-2">
      <select
        value={custom ? OTHER_FACTION : value}
        onChange={(event) => {
          if (event.target.value === OTHER_FACTION) {
            setCustom(true);
            onChange("");
          } else {
            setCustom(false);
            onChange(event.target.value);
          }
        }}
        className={clsx(inputClassName, "appearance-none bg-app-surface")}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {factions.map((faction) => (
          <option key={faction} value={faction}>
            {faction}
          </option>
        ))}
        <option value={OTHER_FACTION}>Другая…</option>
      </select>

      {custom && (
        <input
          type="text"
          value={value}
          maxLength={80}
          autoFocus
          placeholder="Название фракции"
          onChange={(event) => onChange(event.target.value)}
          className={inputClassName}
        />
      )}
    </div>
  );
}

/** Армия, очки, опыт — одна форма для игры и тренировок Warhammer */
export function PlayerInfoForm({
  value,
  onChange,
  options,
  playerName,
}: {
  value: PlayerFormValue;
  onChange: (value: PlayerFormValue) => void;
  options: BookingOptions;
  playerName?: string;
}) {
  const set = (patch: Partial<PlayerFormValue>) =>
    onChange({ ...value, ...patch });

  return (
    <div className="space-y-5">
      {playerName && (
        <Field label="Имя" hint="Берём из Telegram">
          <div className="rounded-lg border border-white/10 bg-white/3 px-3 py-2.5 text-sm text-white/80">
            {playerName}
          </div>
        </Field>
      )}

      <Field label="Армия">
        <FactionInput
          factions={options.factions}
          value={value.army}
          onChange={(army) => set({ army })}
          placeholder="Выберите армию"
        />
      </Field>

      <Field label="Очки">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {options.pointsPresets.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-pressed={value.points === String(preset)}
                onClick={() => set({ points: String(preset) })}
                className={clsx(
                  "rounded-lg border px-3 py-2 text-sm font-semibold transition-colors",
                  value.points === String(preset)
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-white/10 bg-white/5 text-white active:bg-white/10",
                )}
              >
                {preset}
              </button>
            ))}
          </div>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={options.maxPoints}
            placeholder="Или введите своё значение"
            value={value.points}
            onChange={(event) =>
              set({ points: event.target.value.replace(/\D/g, "").slice(0, 5) })
            }
            className={inputClassName}
          />
        </div>
      </Field>

      <Field label="Уровень опыта">
        <ChoiceChips
          columns={2}
          options={options.experienceLevels}
          value={value.experienceLevel}
          onChange={(experienceLevel) => set({ experienceLevel })}
        />
      </Field>
    </div>
  );
}

/** Форма записи на покраску миниатюр */
export function PaintingForm({
  value,
  onChange,
  options,
}: {
  value: PaintingFormValue;
  onChange: (value: PaintingFormValue) => void;
  options: BookingOptions;
}) {
  const set = (patch: Partial<PaintingFormValue>) =>
    onChange({ ...value, ...patch });

  return (
    <div className="space-y-5">
      <Field label="Фракция">
        <FactionInput
          factions={options.factions}
          value={value.faction}
          onChange={(faction) => set({ faction })}
        />
      </Field>

      <Field label="Модель / миниатюра">
        <input
          type="text"
          value={value.model}
          maxLength={120}
          placeholder="Например: Intercessors"
          onChange={(event) => set({ model: event.target.value })}
          className={inputClassName}
        />
      </Field>

      <Field label="Краски">
        <ChoiceChips
          columns={2}
          options={options.paintSources}
          value={value.paintSource}
          onChange={(paintSource) => set({ paintSource })}
        />
      </Field>

      <Field label="Нужна помощь с покраской?">
        <YesNoChips
          value={value.needsHelp}
          onChange={(needsHelp) => set({ needsHelp })}
          yesLabel="Да, помогите"
          noLabel="Нет, справлюсь"
        />
      </Field>

      <Field label="Комментарий (необязательно)">
        <textarea
          value={value.comment}
          maxLength={500}
          rows={2}
          placeholder="Что ещё подготовить: кисти, грунт, инструменты…"
          onChange={(event) => set({ comment: event.target.value })}
          className={clsx(inputClassName, "resize-none")}
        />
      </Field>
    </div>
  );
}
