import { create } from 'zustand';

/**
 * Язык WarpBuilder 40K (решение владельца 06.11.2026; 16.11.2026 — и интерфейс): ru — русские тексты wh-rules.ru и
 * русский интерфейс, en — оригинальные английские тексты и английский интерфейс (ui/common/i18n.ts).
 * Выбор хранится на устройстве; по умолчанию — ru.
 */
export type RosterLang = 'ru' | 'en';

const STORAGE_KEY = 'warphub:roster-40k-lang';

function readLang(): RosterLang {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'ru';
  } catch {
    return 'ru';
  }
}

export const useRosterLang = create<{ lang: RosterLang; setLang: (lang: RosterLang) => void }>((set) => ({
  lang: readLang(),
  setLang: (lang) => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // нет доступа к хранилищу — выбор действует до перезапуска
    }
    set({ lang });
  },
}));
