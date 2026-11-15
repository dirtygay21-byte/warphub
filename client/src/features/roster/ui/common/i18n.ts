import { createContext, useCallback, useContext } from 'react';
import { useRosterLang } from './useRosterLang';

/**
 * Язык интерфейса WarpBuilder 40K (16.11.2026, решение владельца: «на английском — всё на английском, на русском —
 * всё на русском»). Переключатель RU/EN действует только внутри экранов 40K (провайдер Lang40k в App);
 * общие компоненты в AoS, Kill Team и Warcry остаются русскими.
 */
export const Lang40k = createContext(false);

/** true — показывать английский (экран 40K и выбран EN). */
export function useEn(): boolean {
  const scoped = useContext(Lang40k);
  const lang = useRosterLang((s) => s.lang);
  return scoped && lang === 'en';
}

/** t('Русский', 'English') — строка на языке экрана. */
export function useT(): (ru: string, en: string) => string {
  const en = useEn();
  return useCallback((ru: string, e: string) => (en ? e : ru), [en]);
}
