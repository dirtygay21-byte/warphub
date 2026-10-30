import type { BookingOptions } from "@/apiUtils/booking";
import type { PaintingFormValue, PlayerFormValue } from "./formValues";
import clsx from "clsx";
import { useState } from "react";
import { RosterPick } from "./RosterPick";
import {
  ChoiceChips,
  Field,
  inputClassName,
  YesNoChips,
} from "./FormControls";

const OTHER_FACTION = "__other__";

/** Фракция: список из справочника (или по группам) + «Другая» со своим вариантом */
export function FactionInput({
  factions,
  groups,
  value,
  onChange,
  placeholder = "Выберите фракцию",
}: {
  factions: string[];
  /** список по группам (Kill Team: «Imperium · Space Marines»); тогда factions — тот же список плоско */
  groups?: { label: string; items: string[] }[];
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
        {groups
          ? groups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.items.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </optgroup>
            ))
          : factions.map((faction) => (
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

/**
 * Игра (40K / AoS / Kill Team / Warcry), армия, команда или варбанда, очки (кроме Kill Team), опыт — одна форма для игры и тренировок
 * Warhammer. lockedGame — игра задана (присоединение к столу: как у первого игрока; правка записи — прежняя).
 */
export function PlayerInfoForm({
  value,
  onChange,
  options,
  playerName,
  lockedGame,
}: {
  value: PlayerFormValue;
  onChange: (value: PlayerFormValue) => void;
  options: BookingOptions;
  playerName?: string;
  lockedGame?: string | null;
}) {
  const set = (patch: Partial<PlayerFormValue>) =>
    onChange({ ...value, ...patch });
  const kt = value.game === "kt";
  const wc = value.game === "warcry";
  const list = value.game === "aos" ? options.aosFactions : kt ? options.killTeams : wc ? options.warcryFactions : options.factions;
  // ростер из WarpBuilder: новое значение армии — пересоздать поле выбора (фракции может не быть в списке)
  const [picked, setPicked] = useState(0);
  // Kill Team: команды по фракциям — «Imperium · Space Marines»
  const groups = kt
    ? options.killTeamGroups.flatMap((g) =>
        g.factions.map((f) => ({ label: f.faction === g.group ? g.group : `${g.group} · ${f.faction}`, items: f.teams })),
      )
    : undefined;

  return (
    <div className="space-y-5">
      {playerName && (
        <Field label="Имя" hint="Берём из Telegram">
          <div className="flex min-h-12 items-center rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-base text-fg-2">
            {playerName}
          </div>
        </Field>
      )}

      <Field label="Игра" hint={lockedGame ? "Как у соперника за этим столом" : undefined}>
        {lockedGame ? (
          <div className="flex min-h-12 items-center rounded-xl border border-accent/40 bg-accent/10 px-3.5 py-3 text-[15px] font-semibold text-fg">
            {options.games.find((g) => g.value === lockedGame)?.label ?? lockedGame}
          </div>
        ) : (
          <ChoiceChips
            columns={2}
            options={options.games}
            value={value.game}
            onChange={(game) =>
              // другая игра — другой список армий; очки у Kill Team не нужны
              set({ game: game as PlayerFormValue["game"], army: "", points: game === "kt" ? "" : value.points })
            }
          />
        )}
      </Field>

      <RosterPick
        key={value.game}
        game={value.game}
        onPick={(r) => {
          setPicked((n) => n + 1);
          set({ army: r.army.slice(0, 80), ...(r.points != null && !kt ? { points: String(r.points) } : {}) });
        }}
      />

      <Field label={kt ? "Команда (kill team)" : wc ? "Варбанда (фракция)" : "Армия"}>
        <FactionInput
          key={`${value.game}-${picked}`}
          factions={list}
          groups={groups}
          value={value.army}
          onChange={(army) => set({ army })}
          placeholder={kt ? "Выберите команду" : wc ? "Выберите фракцию" : "Выберите армию"}
        />
      </Field>

      {!kt && (
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
      )}

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
