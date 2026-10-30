/**
 * Ростеры WarpBuilder для формы записи (W6 30.10.2026): сохранённые ростеры выбранной игры → название армии и очки.
 * Грузится динамически (import()) из формы записи и только для пользователей с доступом к WarpBuilder.
 * Названия фракций — из индексов данных WarpBuilder; очки — из сводки ростера (считается в редакторе).
 */
import { loadAosIndex, loadIndex, loadKtIndex, loadWarcryIndex } from './data';
import { loadAosRosters, loadKtRosters, loadRosters, loadWarcryRosters } from './storage';

export type BookingGame = '40k' | 'aos' | 'kt' | 'warcry';
export interface BookingRoster {
  id: string;
  name: string;
  /** фракция (40K, AoS, Warcry) или команда (Kill Team) */
  army: string;
  /** очки из сводки ростера; у Kill Team — null */
  points: number | null;
  updatedAt: number;
}

const byDate = (a: BookingRoster, b: BookingRoster) => b.updatedAt - a.updatedAt;

export async function bookingRosters(game: BookingGame): Promise<BookingRoster[]> {
  if (game === '40k') {
    const [list, index] = await Promise.all([loadRosters(), loadIndex()]);
    const name = new Map(index.factions.map((f) => [f.id, f.name]));
    return list.map((r) => ({ id: r.id, name: r.name, army: name.get(r.factionId) ?? r.factionId, points: r.summary?.points ?? null, updatedAt: r.updatedAt })).sort(byDate);
  }
  if (game === 'aos') {
    const [list, index] = await Promise.all([loadAosRosters(), loadAosIndex()]);
    const name = new Map(index.factions.map((f) => [f.id, f.name]));
    return list.map((r) => ({ id: r.id, name: r.name, army: name.get(r.factionId) ?? r.factionId, points: r.summary?.points ?? null, updatedAt: r.updatedAt })).sort(byDate);
  }
  if (game === 'kt') {
    const [list, index] = await Promise.all([loadKtRosters(), loadKtIndex()]);
    const name = new Map(index.teams.map((t) => [t.id, t.name]));
    return list.map((r) => ({ id: r.id, name: r.name, army: name.get(r.teamId) ?? r.teamId, points: null, updatedAt: r.updatedAt })).sort(byDate);
  }
  const [list, index] = await Promise.all([loadWarcryRosters(), loadWarcryIndex()]);
  const name = new Map(index.factions.map((f) => [f.id, f.name]));
  return list.map((r) => ({ id: r.id, name: r.name, army: name.get(r.factionId) ?? r.factionId, points: r.summary?.points ?? null, updatedAt: r.updatedAt })).sort(byDate);
}
