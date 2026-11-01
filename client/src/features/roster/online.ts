/**
 * API игры на двух телефонах (T2): создание, вход по коду, журнал. Ответы с кодом статуса — чтобы отличать
 * «журнал ушёл вперёд» (409, lastSeq) от прочих ошибок.
 */
import { getApiAuthToken } from '@/apiUtils/authToken';
import type { GameEvent, Seat } from './game';

export type OnlinePlayer = { name: string; username: string | null } | null;
export type OnlineGame = {
  id: string;
  code: string;
  seat: Seat | null;
  lastSeq: number;
  players: { p1: OnlinePlayer; p2: OnlinePlayer };
  createdAt: string;
  updatedAt: string;
};
export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; code?: string; lastSeq?: number };

export async function call<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const token = import.meta.env.VITE_EXECUTION_CONFIG === 'production' ? getApiAuthToken() : `${import.meta.env.VITE_EXECUTION_DEVELOPMENT_TOKEN}`;
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(`${import.meta.env.VITE_BACKEND_API_URL}${path}`, { ...init, headers });
  } catch {
    return { ok: false, status: 0, error: 'Нет связи с сервером' };
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* не JSON */
  }
  if (res.ok) return { ok: true, data: json as T };
  const j = (json ?? {}) as { error?: string; code?: string; lastSeq?: number };
  return { ok: false, status: res.status, error: j.error ?? `Ошибка сервера (${res.status})`, code: j.code, lastSeq: j.lastSeq };
}

export const createOnlineGame = () => call<OnlineGame>('/roster/games', { method: 'POST' });
export const joinOnlineGame = (code: string) => call<OnlineGame>('/roster/games/join', { method: 'POST', body: JSON.stringify({ code }) });
export const listOnlineGames = () => call<{ games: OnlineGame[] }>('/roster/games');
export const getOnlineEvents = (id: string, after: number) =>
  call<{ game: OnlineGame; events: GameEvent[] }>(`/roster/games/${encodeURIComponent(id)}/events?after=${after}`);
export const postOnlineEvent = (id: string, expectedSeq: number, event: GameEvent) =>
  call<{ lastSeq: number }>(`/roster/games/${encodeURIComponent(id)}/events`, { method: 'POST', body: JSON.stringify({ expectedSeq, event }) });
