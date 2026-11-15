import { haptic } from '@/utils/haptic';
import { cx } from '../util';
import { useRosterLang, type RosterLang } from './useRosterLang';
import { useT } from './i18n';

const OPTIONS: { value: RosterLang; label: string; aria: string }[] = [
  { value: 'ru', label: 'RU', aria: 'Русский' },
  { value: 'en', label: 'EN', aria: 'English' },
];

/** Переключатель языка 40K (RU / EN): интерфейс и тексты правил (16.11.2026) — в шапке списка, редактора и «Правил». */
export function LangSwitch() {
  const t = useT();
  const lang = useRosterLang((s) => s.lang);
  const setLang = useRosterLang((s) => s.setLang);
  return (
    <div role="radiogroup" aria-label={t('Язык', 'Language')} className="flex h-9 shrink-0 items-center rounded-lg bg-white/[0.06] p-0.5">
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
