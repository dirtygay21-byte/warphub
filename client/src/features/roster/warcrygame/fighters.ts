import { abilitiesFor, autoGroups, universalFor, type WarcryRoster } from '../warcry/roster';
import type { WarcryAbility, WarcryFaction } from '../warcry/types';
import type { Color, WcFighterInfo, WcRosterSetup } from './index';

/** Снимок варбанды для журнала: ссылки на исходных бойцов и только id/cost способностей, без длинных текстов. */
export function buildWarcryRosterSetup(
  source: WarcryRoster,
  color: Color,
  factions: ReadonlyMap<string, WarcryFaction>,
  universal: WarcryAbility[],
): WcRosterSetup {
  const roster = source.fighters.every((fighter) => fighter.group) ? source : autoGroups(source);
  const fighterData: Record<string, WcFighterInfo> = {};
  for (const selected of roster.fighters) {
    const faction = factions.get(selected.factionId);
    const fighter = faction?.fighters.find((item) => item.id === selected.fighterId);
    if (!faction || !fighter) throw new Error(`Не удалось загрузить бойца ${selected.fighterId}`);
    const abilities = [...abilitiesFor(faction, fighter), ...universalFor(universal, fighter)]
      .filter((ability) => ability.cost !== 'battletrait')
      .map((ability) => ({ id: ability.id, cost: ability.cost as WcFighterInfo['abilities'][number]['cost'] }));
    fighterData[selected.uid] = {
      name: selected.name || fighter.name,
      factionId: selected.factionId,
      fighterId: selected.fighterId,
      abilities,
    };
  }
  return {
    id: roster.id,
    color,
    fighters: roster.fighters.map((fighter) => fighter.uid),
    groups: Object.fromEntries(roster.fighters.map((fighter) => [fighter.uid, fighter.group ?? 'dagger'])),
    fighterData,
  };
}

export function warcryAbilityCatalog(factions: ReadonlyMap<string, WarcryFaction>, universal: WarcryAbility[]): Map<string, WarcryAbility> {
  const catalog = new Map<string, WarcryAbility>();
  for (const ability of universal) catalog.set(ability.id, ability);
  for (const faction of factions.values()) for (const ability of faction.abilities) catalog.set(ability.id, ability);
  return catalog;
}
