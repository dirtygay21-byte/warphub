/**
 * Подсказки AoS (07.11.2026): способности оружия и ключевые слова в карточке юнита нажимаются и открывают текст.
 * Основные — из core-rules.json (BSData age-of-sigmar-4th, scripts/bsdata-aos-core.py); способности оружия фракции
 * («Blood-hungry», «Wyrdflame») — правило с тем же названием у варскролла или в боевых чертах фракции.
 * Не найдено — подсказки нет, текст показывается как есть.
 */
import core from './core-rules.json';
import type { AosRule } from './types';

export type AosHint = { name: string; text: string; sub: string };

const SRC = 'Core Rules · BSData';
const key = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/\s*\(\s*/g, ' (').trim();
const weapon = new Map(core.weaponAbilities.map((w) => [key(w.name), w]));
const keywords = new Map(core.keywords.map((k) => [k.keyword, k]));
const ANTI = /^anti-(.+?)\s*\(\s*\+1 rend\s*\)$/i;

/** «Anti-INFANTRY (+1 Rend), Crit (Mortal)» → отдельные способности. */
export function splitAosAbilities(s: string | null | undefined): string[] {
  if (!s || s.trim() === '-') return [];
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Текст способности оружия; extra — правила варскролла и фракции (для способностей оружия фракции). */
export function aosWeaponHint(label: string, extra: AosRule[] = []): AosHint | null {
  const anti = label.match(ANTI);
  if (anti) {
    const w = weapon.get(key('Anti-X (+1 Rend)'));
    return w ? { name: label, text: w.text, sub: `Способность оружия · ${SRC}` } : null;
  }
  const w = weapon.get(key(label));
  if (w) return { name: w.name, text: w.text, sub: `Способность оружия · ${SRC}` };
  const own = extra.find((r) => key(r.name) === key(label));
  return own ? { name: own.name, text: own.text, sub: 'Способность фракции' } : null;
}

/** Текст основного ключевого слова (FLY, WARD, CHAMPION…); param — значение («5+»). */
export function aosKeywordHint(keyword: string, param?: string | null): AosHint | null {
  const k = keywords.get(keyword.toUpperCase().replace(/\s*\(.*\)$/, '').trim());
  if (!k) return null;
  return { name: param ? `${k.keyword} (${param})` : k.keyword, text: k.text, sub: `${k.name} · ${SRC}` };
}

export const AOS_CORE_SOURCE = core.source;
