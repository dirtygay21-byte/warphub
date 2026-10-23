import { createContext, useContext } from 'react';
import type { Seat } from '../../game';

/** Открыть карту миссии в просмотре (G3.8): id карты и, если известно, чья она — для статуса в игре. */
export type OpenCard = (id: string, seat?: Seat) => void;

export const CardViewerContext = createContext<OpenCard | null>(null);

/** Функция открытия карты; null — просмотр недоступен (экран вне игры). */
export function useOpenCard(): OpenCard | null {
  return useContext(CardViewerContext);
}
