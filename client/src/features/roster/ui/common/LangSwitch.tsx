import { haptic } from '@/utils/haptic';
import { cx } from '../util';
import { useRosterLang, type RosterLang } from './useRosterLang';

const OPTIONS: { value: RosterLang; label: string; aria: string }[] = [
  { value: 'ru', label: 'RU', aria: 'Тексты правил на русском' },
  { value: 'en', label: 'EN', aria: 'Тексты правил на английском' },
];

/** Переключатель языка текстов 40K (RU / EN) — в шапке редактора ростера. */
export function LangSwitch() {
  const lang = useRosterLang((s) => s.lang);
  const setLang = useRosterLang((s) => s.setLang);
  return (
    <div role="radiogroup" aria-label="Язык текстов правил" className="flex h-9 shrink-0 items-center rounded-lg bg-white/[0.06] p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={lang === o.value}
          aria-label={o.aria}
          onClick={() => {
            if (lang === o.value) return;
            haptic.select();
            setLang(o.value);
          }}
          className={cx(
            'h-8 min-w-9 rounded-md px-2 text-[12px] font-semibold transition-colors',
            lang === o.value ? 'bg-accent text-accent-foreground' : 'text-fg-3',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
