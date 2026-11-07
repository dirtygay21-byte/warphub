/**
 * Кубики: «В приложении» или «Вручную» (решение владельца 07.11.2026). Переключатель стоит в правом верхнем углу
 * каждого блока с броском во всех играх (40K, Dominatus, AoS, Kill Team, Warcry). Вручную — игроки бросают свои кубики
 * и записывают итог (кто выиграл, по желанию — значения); дальше игра идёт так же. Выбор один на устройство и
 * запоминается: переключили в одной игре — так открываются броски и в остальных.
 */
import type { ReactNode } from 'react';
import { create } from 'zustand';
import { haptic } from '../../telegram';
import { cx } from '../util';

export type DiceMode = 'app' | 'manual';
const STORAGE_KEY = 'warphub:dice-mode';

function readMode(): DiceMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'manual' ? 'manual' : 'app';
  } catch {
    return 'app';
  }
}

export const useDiceMode = create<{ mode: DiceMode; setMode: (mode: DiceMode) => void }>((set) => ({
  mode: readMode(),
  setMode: (mode) => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // нет доступа к хранилищу — выбор действует до перезапуска
    }
    set({ mode });
  },
}));

/** Компактный переключатель «В приложении / Вручную». */
export function DiceModeSwitch({ className }: { className?: string }) {
  const mode = useDiceMode((s) => s.mode);
  const setMode = useDiceMode((s) => s.setMode);
  return (
    <div role="radiogroup" aria-label="Как бросать кубики" className={cx('inline-flex shrink-0 rounded-lg bg-white/[0.06] p-0.5', className)}>
      {(
        [
          ['app', 'В приложении'],
          ['manual', 'Вручную'],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={mode === value}
          onClick={() => {
            if (mode === value) return;
            haptic.select();
            setMode(value);
          }}
          className={cx('ds-hit rounded-md px-2.5 py-1 text-[12px] font-semibold transition', mode === value ? 'bg-accent text-accent-foreground' : 'text-fg-3')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Шапка блока с броском: подпись слева, переключатель справа; в ручном режиме — подсказка, что бросать самим.
 * hint — что записать после своего броска (например «кто выиграл roll-off»).
 */
export function DiceHead({ title, hint }: { title?: ReactNode; hint?: string }) {
  const mode = useDiceMode((s) => s.mode);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-[12px] font-semibold uppercase tracking-wider text-fg-3">{title ?? 'Бросок'}</p>
        <DiceModeSwitch />
      </div>
      {mode === 'manual' && <p className="text-[12px] leading-snug text-fg-3">Бросьте кубики сами{hint ? ` и отметьте ${hint}` : ''}.</p>}
    </div>
  );
}
