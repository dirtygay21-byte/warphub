/**
 * Правила оружия Kill Team в строке профиля (07.11.2026): «Rng 8", Lethal 5+, Prc1, *Poison» → отдельные правила,
 * у каждого — текст. Общие правила — справочник WR из данных KTDash (index.weaponRules: код или название с «_» вместо
 * значения); правила со звёздочкой — способность самого оперативника с тем же названием («*Poison»).
 * Не найдено — правило показывается текстом без подсказки (ничего не придумываем).
 */
import type { KtIndex, KtOperative } from './types';

export type KtRuleToken = { label: string; rule: { name: string; text: string; sub?: string } | null };
type WeaponRule = KtIndex['weaponRules'][number];

const norm = (s: string) => s.toUpperCase().replace(/\s+/g, '').replace(/_/g, '');
/** значение в конце правила: «5+», «1"», «2», «8"» */
const PARAM = /\s*(\d+\+?"?)$/;

/** Делит строку правил по запятым вне скобок. */
export function splitKtRules(rules: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of rules) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Поиск по справочнику: по коду и по названию (без пробелов и регистра, «_» — место значения). */
export function ktRuleIndex(rules: WeaponRule[]) {
  const map = new Map<string, WeaponRule>();
  for (const r of rules) for (const k of [norm(r.code), norm(r.name)]) if (!map.has(k)) map.set(k, r);
  return (token: string): { rule: WeaponRule; param: string | null } | null => {
    const exact = map.get(norm(token));
    if (exact) return { rule: exact, param: null };
    const m = token.match(PARAM);
    if (!m) return null;
    const r = map.get(norm(token.slice(0, m.index)));
    return r ? { rule: r, param: m[1] } : null;
  };
}

/** Правила профиля оружия с текстами. own — способности оперативника (для правил со звёздочкой). */
export function ktWeaponRuleTokens(rules: string, find: ReturnType<typeof ktRuleIndex>, own: KtOperative['abilities'] = []): KtRuleToken[] {
  return splitKtRules(rules).map((label) => {
    if (label.startsWith('*')) {
      const a = own.find((x) => x.name.trim().toLowerCase() === label.toLowerCase());
      return { label, rule: a ? { name: label.slice(1), text: a.text, sub: 'Способность оперативника' } : null };
    }
    const hit = find(label);
    if (!hit) return { label, rule: null };
    const name = hit.param ? hit.rule.name.replace(/\s*_/, ' ' + hit.param).trim() : hit.rule.name.replace(/\s*_/, '').trim();
    const text = hit.param ? hit.rule.text.replace(/_/g, hit.param) : hit.rule.text;
    return { label, rule: { name, text, sub: 'Правило оружия (WR) · Kill Team' } };
  });
}
