/**
 * Рунмарки Warcry (07.11.2026): у оружия в Warcry своих правил нет, поэтому нажатие на рунмарку бойца показывает,
 * какие способности (фракции и универсальные) она открывает этому бойцу. Список — из данных бойца, ничего не дописываем.
 */
import type { WarcryAbility } from './types';

const COST: Record<string, string> = { double: 'Double', triple: 'Triple', quad: 'Quad', reaction: 'Reaction', passive: 'Passive', battletrait: 'Battle trait' };

export type RunemarkHint = { title: string; sub: string; text: string; count: number };

/** abilities — уже доступные этому бойцу способности (abilitiesFor + universalFor). */
export function runemarkHint(runemark: string, abilities: WarcryAbility[]): RunemarkHint {
  const list = abilities.filter((a) => a.runemarks.includes(runemark));
  const title = runemark.charAt(0).toUpperCase() + runemark.slice(1);
  if (!list.length) return { title, sub: 'Рунмарка', text: 'Способностей, которым нужна эта рунмарка, у бойца нет.', count: 0 };
  return {
    title,
    sub: `Рунмарка · открывает способностей: ${list.length}`,
    text: list.map((a) => `${a.name} · ${COST[a.cost] ?? a.cost}\n${a.text}`).join('\n\n'),
    count: list.length,
  };
}
