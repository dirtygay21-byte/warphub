import { createContext, useContext } from 'react';
import type { Seat } from '../../game';

/** Открыть карту миссии в просмотре (G3.8): id карты и, если известно, чья она — для статуса в игре. */
export type OpenCard = (id: string, seat?: Seat) => void;

export const CardViewerContext = createContext<OpenCard | null>(null);

/** Функция открытия карты; null — просмотр недоступен (экран вне игры). */
export function useOpenCard(): OpenCard | null {
  return useContext(CardViewerContext);
}

/** Открыть ростер игрока в просмотре (режим мастера, G2.12); null — режим мастера выключен. */
export type OpenRoster = (seat: Seat) => void;

export const RosterViewerContext = createContext<OpenRoster | null>(null);

/** Функция открытия ростера; null — режим мастера выключен или ростера нет. */
export function useOpenRoster(): OpenRoster | null {
  return useContext(RosterViewerContext);
}
