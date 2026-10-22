/**
 * Выборы снаряжения (RosterUnit.picks) хранятся по ключу варианта — номеру фразы в Datasheet.options — и номеру
 * варианта в списке. Если при обновлении данных фразы инфолиста изменились (тот же id), по прежним номерам
 * выбор указывал бы на другое оружие. Здесь:
 *  - buildOptionRemap (сборка данных): сопоставление прежних вариантов с новыми ПО СМЫСЛУ — кто меняет, что
 *    снимается, условия и лимит, набор предметов каждого варианта; не по номеру. Соответствие только однозначное
 *    (ровно один кандидат с обеих сторон), иначе null;
 *  - remapPicks (открытие ростера): совместимые выборы переводятся на новые ключи и номера, остальные откладываются.
 */
import type { Datasheet, OptionRemap } from './types';
import { optionsOf, type Item, type ParsedOption, type Picks } from './wargear';

const k = (s: string) => s.toLowerCase().replace(/[’‘`]/g, "'").replace(/[-‑]/g, ' ').replace(/\s+/g, ' ').trim();
const items = (list: Item[]) =>
  list
    .map((i) => `${i.qty}×${k(i.weapon)}`)
    .sort()
    .join('+');
const limitSig = (o: ParsedOption) => (o.limit.kind === 'fixed' ? `fixed${o.limit.n}` : o.limit.kind === 'each' ? 'each' : `per${o.limit.per}:${o.limit.n}`);
/** Смысл варианта без самих вариантов замены: кто, лимит, условия, что снимается. */
export const optionSig = (o: ParsedOption): string =>
  [k(o.group ?? ''), limitSig(o), o.minModels, o.maxModels, items(o.from), items(o.requires), items(o.forbids), o.perModel, o.noDup ? 1 : 0, o.pairs ? 1 : 0, o.perInstance ? 1 : 0].join('|');
export const choiceSig = (c: Item[]): string => items(c);

const sameOptions = (a: Datasheet, b: Datasheet) => JSON.stringify(a.options.map((o) => o.text)) === JSON.stringify(b.options.map((o) => o.text));

/** Таблица перевода выборов для инфолиста, у которого изменились варианты; null — варианты не изменились. */
export function buildOptionRemap(oldDs: Datasheet, newDs: Datasheet, note: string): OptionRemap | null {
  if (sameOptions(oldDs, newDs)) return null;
  const before = optionsOf(oldDs).parsed;
  const after = optionsOf(newDs).parsed;
  const count = (list: ParsedOption[]) => {
    const m = new Map<string, number>();
    for (const o of list) m.set(optionSig(o), (m.get(optionSig(o)) ?? 0) + 1);
    return m;
  };
  const nb = count(before);
  const na = count(after);
  const keys: OptionRemap['keys'] = {};
  for (const o of before) {
    const sig = optionSig(o);
    const target = nb.get(sig) === 1 && na.get(sig) === 1 ? after.find((x) => optionSig(x) === sig)! : null;
    if (!target) {
      keys[o.key] = null;
      continue;
    }
    const sigs = target.choices.map(choiceSig);
    const choices = o.choices.map((c) => {
      const s = choiceSig(c);
      return sigs.filter((x) => x === s).length === 1 ? sigs.indexOf(s) : -1;
    });
    keys[o.key] = { to: target.key, choices };
  }
  return { note, keys };
}

/** Перевести выборы по таблице: { picks — переведённые, dropped — отложенные (как были) }. */
export function remapPicks(picks: Picks, remap: OptionRemap): { picks: Picks; dropped: Picks } {
  const out: Picks = {};
  const dropped: Picks = {};
  for (const [key, counts] of Object.entries(picks)) {
    if (!counts.some((n) => n > 0)) continue;
    const m = remap.keys[key];
    const ok = !!m && counts.every((n, i) => n <= 0 || (m.choices[i] ?? -1) >= 0) && !(m.to in out);
    if (!ok) {
      dropped[key] = counts;
      continue;
    }
    const size = Math.max(0, ...m.choices) + 1;
    const next = Array.from({ length: size }, () => 0);
    counts.forEach((n, i) => {
      if (n > 0) next[m.choices[i]!] += n;
    });
    out[m.to] = next;
  }
  return { picks: out, dropped };
}
