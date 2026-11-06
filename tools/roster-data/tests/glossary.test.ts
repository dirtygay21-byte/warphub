// Глоссарий правил 40K (wh-rules.ru, 01.11.2026): снимок цел, каждая способность оружия и основная способность юнита
// из данных приложения находится в глоссарии; разметка текстов разбирается.
import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { findAbility, findKeyword, localizeGlossary, parseRich, splitWeaponKeywords, type Glossary } from '../../../client/src/features/roster/glossary';
import { buildGlossary } from '../scripts/whrules-glossary.mjs';

const DATA = path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data');
const g: Glossary = JSON.parse(fs.readFileSync(path.join(DATA, 'glossary.json'), 'utf8'));
const index = JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'), 'utf8'));
/** Пробелы источника: на wh-rules.ru нет текста (01.11.2026 — версия данных 995). Показываются «нет данных». */
const KNOWN_GAPS = { weapon: ["c'tan power"], terms: ['other', 'you'] };
const factions = index.factions.map((f: { id: string }) => JSON.parse(fs.readFileSync(path.join(DATA, 'f', `${f.id}.json`), 'utf8')));

describe('glossary.json', () => {
  test('собран из снимка без ручных правок', () => {
    const file = path.basename(g.source.snapshot);
    const snap = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', '40k', file), 'utf8'));
    expect(buildGlossary(snap, file)).toEqual(g);
    expect(g.source.site).toBe('https://wh-rules.ru');
  });

  test('способности оружия из инфолистов — все в глоссарии', () => {
    const missing = new Map<string, number>();
    for (const f of factions)
      for (const ds of f.datasheets)
        for (const w of ds.weapons)
          for (const p of w.profiles)
            for (const k of splitWeaponKeywords(p.keywords)) if (!findAbility(g, k)) missing.set(k.toLowerCase(), (missing.get(k.toLowerCase()) ?? 0) + 1);
    if (missing.size) console.log('нет в глоссарии (способности оружия):', [...missing].sort((a, b) => b[1] - a[1]).slice(0, 30));
    expect([...missing.keys()].sort()).toEqual(KNOWN_GAPS.weapon);
  });

  test('основные способности юнитов (core) — все в глоссарии', () => {
    const missing = new Set<string>();
    for (const f of factions) for (const ds of f.datasheets) for (const a of ds.abilities) if (a.type === 'core' && !findAbility(g, a.name)) missing.add(a.name);
    expect([...missing]).toEqual([]);
  });

  test('ссылки [gloss:id] в текстах ведут на существующие термины', () => {
    const texts = [...Object.values(g.abilities).flatMap((a) => [a.text, a.example ?? '']), ...Object.values(g.weapon).flat(), ...Object.values(g.terms).map((t) => t.text)];
    const broken = new Set<string>();
    for (const t of texts) for (const p of parseRich(t)) if (p.t === 'term' && !g.terms[p.id]) broken.add(p.id);
    expect([...broken].sort()).toEqual(KNOWN_GAPS.terms.filter((id) => broken.has(id)));
    expect([...broken].every((id) => KNOWN_GAPS.terms.includes(id))).toBe(true);
  });
});

describe('поиск и разбор', () => {
  test('параметры отбрасываются, берётся самое длинное совпадение', () => {
    const key = (s: string) => {
      const h = findAbility(g, s);
      return h && h.kind !== 'term' ? h.key : null;
    };
    expect(key('rapid fire 1')).toBe('RAPID FIRE');
    expect(key('Anti-Infantry 4+')).toBe('ANTI');
    expect(key('sustained hits D3')).toBe('SUSTAINED HITS');
    expect(key('Lethal Hits: non-Monster/Vehicle')).toBe('LETHAL HITS');
    expect(key('[BLAST]')).toBe('BLAST');
    expect(key('Feel No Pain 5+')).toBe('FEEL NO PAIN');
    expect(key('psychic assassin')).toBe('PSYCHIC ASSASSIN');
    expect(key('psychic')).toBe('PSYCHIC');
    expect(key('Twin-linked')).toBe('TWIN-LINKED');
    expect(key('Blastmaster')).toBeNull();
    expect(findKeyword(g, 'Vehicle')?.kind).toBe('term');
  });

  test('разметка wh-rules: основные способности и выделение', () => {
    expect(parseRich('Имеет [core:Feel No Pain 5+] и __не__ может.')).toEqual([
      { t: 'text', s: 'Имеет ' },
      { t: 'core', s: 'Feel No Pain 5+' },
      { t: 'text', s: ' и ' },
      { t: 'em', s: 'не' },
      { t: 'text', s: ' может.' },
    ]);
  });

  test('разметка wh-rules', () => {
    expect(parseRich('Добавьте **[gloss:attack-dice:кубики атаки]** для **[BLAST]**, см. [gloss:select-targets:Выбор целей].')).toEqual([
      { t: 'text', s: 'Добавьте ' },
      { t: 'term', id: 'attack-dice', s: 'кубики атаки' },
      { t: 'text', s: ' для ' },
      { t: 'bold', s: '[BLAST]' },
      { t: 'text', s: ', см. ' },
      { t: 'term', id: 'select-targets', s: 'Выбор целей' },
      { t: 'text', s: '.' },
    ]);
  });
});

describe('переключатель RU/EN (06.11.2026): английский текст того же снимка wh-rules', () => {
  const en = localizeGlossary(g, 'en');

  test('у всех способностей, способностей оружия и терминов есть английский текст', () => {
    expect(Object.values(g.abilities).filter((a) => !a.en)).toEqual([]);
    expect(Object.keys(g.weapon).filter((k) => !g.weaponEn?.[k])).toEqual([]);
    expect(Object.entries(g.terms).filter(([, t]) => !t.textEn).map(([id]) => id)).toEqual([]);
  });

  test('en подменяет тексты на английские, ru — без изменений', () => {
    expect(localizeGlossary(g, 'ru')).toBe(g);
    const [key, a] = Object.entries(g.abilities)[0]!;
    expect(en.abilities[key]!.text).toBe(a.en!.text);
    expect(en.abilities[key]!.name).toBe(a.name);
    const [termId, t] = Object.entries(g.terms)[0]!;
    expect(en.terms[termId]!.text).toBe(t.textEn!);
    const [wKey] = Object.keys(g.weapon);
    expect(en.weapon[wKey!]).toEqual(g.weaponEn![wKey!]!);
    // поиск по названиям одинаков на обоих языках
    expect(findAbility(en, 'Deep Strike')?.kind).toBe(findAbility(g, 'Deep Strike')?.kind);
  });

  test('ссылки [gloss:id] в английских текстах ведут на существующие термины', () => {
    const texts = [...Object.values(en.abilities).flatMap((a) => [a.text, a.example ?? '']), ...Object.values(en.weapon).flat(), ...Object.values(en.terms).map((t) => t.text)];
    const broken = new Set<string>();
    for (const t of texts) for (const p of parseRich(t)) if (p.t === 'term' && !g.terms[p.id]) broken.add(p.id);
    expect([...broken].every((id) => KNOWN_GAPS.terms.includes(id))).toBe(true);
  });
});
