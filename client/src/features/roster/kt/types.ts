/**
 * Kill Team (редакция 2024) — данные WarpBuilder (W2 30.10.2026): backend/roster-data/kt, источник — ktdash-v4-public.
 * Своя схема, отдельно от 40K и AoS. Тексты правил — Markdown источника (**жирный**, таблицы |…|, списки).
 */
export interface KtSource { name: string; url: string; file: string; commit: string; date: string; license: string }

export interface KtIndex {
  system: 'kt';
  edition: string;
  source: KtSource;
  factions: { id: string; name: string }[];
  /** special — наборы миссий и неигровые оперативники (фракция SPEC), не команда для обычной игры */
  /** group — группа внутри фракции ktdash по ключевым словам оперативников (Adeptus Astartes…), null — без группы */
  teams: { id: string; factionId: string; name: string; group: string | null; special: boolean; archetypes: string[]; operatives: number }[];
  /** правила оружия: code — как в профиле (с «_» вместо числа) */
  weaponRules: { code: string; name: string; text: string }[];
}

/** rules — правила оружия строкой источника («Rng 6", Lethal 5+»; иногда фраза) */
export interface KtWeaponProfile { name: string; atk: string; hit: string; dmg: string; rules: string }
export interface KtWeapon { id: string; name: string; type: 'ranged' | 'melee' | 'equipment'; default: boolean; profiles: KtWeaponProfile[] }
export interface KtOperative {
  id: string;
  name: string;
  keywords: string[];
  stats: { move: string; apl: number; save: string; wounds: number };
  baseMm: number | null;
  weapons: KtWeapon[];
  abilities: { id: string; name: string; text: string; ap: number | null; factionRule: boolean }[];
  options: { id: string; name: string; text: string; effects: string }[];
}
export interface KtTeam {
  system: 'kt';
  id: string;
  factionId: string;
  name: string;
  special: boolean;
  description: string;
  /** состав команды — текст источника */
  composition: string;
  archetypes: string[];
  operatives: KtOperative[];
  equipment: { id: string; name: string; text: string; effects: string }[];
  /** strategy — стратегические, firefight — боевые уловки; rule — особые правила команды */
  ploys: { id: string; type: 'strategy' | 'firefight' | 'rule'; name: string; text: string; effects: string }[];
}
