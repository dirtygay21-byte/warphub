import clsx from "clsx";
import { useEffect, useState } from "react";

export default function SeatCountControl({
  disabled,
  maxPartyCount,
  selectedPartyCount,
  onChange,
}: {
  disabled: boolean;
  maxPartyCount: number;
  selectedPartyCount: number;
  onChange: (count: number) => void;
}) {
  if (maxPartyCount > 6) {
    return (
      <SeatCountInput
        disabled={disabled}
        maxPartyCount={maxPartyCount}
        selectedPartyCount={selectedPartyCount}
        onChange={onChange}
      />
    );
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {Array.from({ length: maxPartyCount }, (_, index) => index + 1).map(
        (count) => (
          <button
            key={count}
            type="button"
            onClick={() => onChange(count)}
            disabled={disabled}
            className={clsx(
              "ds-hit size-9 rounded-lg border text-sm font-semibold transition-colors",
              selectedPartyCount === count
                ? "border-accent bg-accent text-accent-foreground"
                : "border-white/10 bg-white/5 text-white"
            )}
          >
            {count}
          </button>
        )
      )}
    </div>
  );
}

// Числовой ввод для большого числа мест. Держит собственный текст, чтобы
// поле можно было очистить и ввести новое значение без "залипания" на минимуме.
function SeatCountInput({
  disabled,
  maxPartyCount,
  selectedPartyCount,
  onChange,
}: {
  disabled: boolean;
  maxPartyCount: number;
  selectedPartyCount: number;
  onChange: (count: number) => void;
}) {
  const [text, setText] = useState(String(selectedPartyCount));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(String(selectedPartyCount));
  }, [selectedPartyCount]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    setText(raw);

    if (raw === "") return;

    const parsed = Number(raw);
    if (Number.isNaN(parsed)) return;

    onChange(parsed);
  };

  const handleBlur = () => {
    const parsed = Number(text);
    const normalized =
      text === "" || Number.isNaN(parsed)
        ? 1
        : Math.min(Math.max(Math.trunc(parsed), 1), maxPartyCount);

    setText(String(normalized));
    onChange(normalized);
  };

  return (
    <label className="mt-2 flex items-center gap-3 text-sm text-fg-2">
      <span>Мест</span>
      <input
        type="number"
        min={1}
        max={maxPartyCount}
        value={text}
        disabled={disabled}
        onChange={handleChange}
        onBlur={handleBlur}
        className="w-20 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-accent"
      />
      <span>из {maxPartyCount}</span>
    </label>
  );
}
