import { loadFaction, type BattlefieldData } from '../../data';
import { encodeRoster } from '../../engine/roster';
import { dispositionsOf } from '../../engine/source';
import type { Roster } from '../../engine/types';
import type { RosterRef } from '../../game';

/**
 * Снимок ростера для игры (G2.12): подпись, детачменты, типы армий, которые они дают (id из battlefield.json),
 * выбранный в ростере тип и код ростера (для режима мастера и второго телефона). Данные фракции грузятся,
 * чтобы взять Force Disposition детачментов. Ошибка — строкой: ростер без детачмента, неизвестный тип армии.
 */
export async function rosterRefFor(r: Roster, source: 'own' | 'code', battlefield: BattlefieldData): Promise<RosterRef | string> {
  const faction = await loadFaction(r.factionId).catch(() => null);
  if (!faction) return 'Не удалось загрузить данные фракции ростера';
  const dets = r.detachmentIds.map((id) => faction.detachments.find((d) => d.id === id)).filter((d) => !!d);
  if (!dets.length) return 'В ростере не выбран детачмент — выберите его в WarpBuilder';
  const names = [...new Set(dets.flatMap(dispositionsOf))];
  const ids = names.map((n) => battlefield.dispositions.find((d) => d.name === n)?.id);
  if (!ids.length || ids.some((x) => !x)) return `Тип армии детачмента не найден в картах миссий: ${names.join(', ') || '—'}`;
  return {
    source,
    rosterId: source === 'own' ? r.id : undefined,
    name: r.name,
    factionId: r.factionId,
    points: r.summary?.points,
    forceDisposition: r.forceDisposition,
    dispositions: ids as string[],
    detachments: dets.map((d) => d.name),
    code: encodeRoster(r),
  };
}
