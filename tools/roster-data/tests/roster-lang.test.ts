/**
 * Переключатель RU/EN WarpBuilder 40K (07.11.2026): у каждого текста правил есть русский текст (сайт wh-rules.ru или перевод
 * WarpHub), и экраны, где показываются правила, берут его из оверлея (useRu), а не только английский текст данных.
 */
import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { ruName, ruPlain } from '../../../client/src/features/roster/ru';
import { coreStratagems, leaderNoteRu } from '../scripts/whrules-ru.mjs';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');
const DATA = path.join(ROOT, 'backend', 'roster-data');
const UI = path.join(ROOT, 'client', 'src', 'features', 'roster', 'ui');

describe('русский текст есть у каждого текста правил 40K', () => {
  const index = JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'), 'utf8'));
  for (const { id } of index.factions) {
    test(id, () => {
      const f = JSON.parse(fs.readFileSync(path.join(DATA, 'f', `${id}.json`), 'utf8'));
      const ru = JSON.parse(fs.readFileSync(path.join(DATA, 'ru', `${id}.json`), 'utf8'));
      const miss: string[] = [];
      for (const s of f.stratagems) if (s.text?.trim() && !ru.stratagems?.[s.id]) miss.push(`стратагема ${s.name}`);
      for (const e of f.enhancements) if (e.text?.trim() && !ru.enhancements?.[e.id]) miss.push(`улучшение ${e.name}`);
      for (const d of f.detachments) for (const a of d.abilities ?? []) if (a.text?.trim() && !ru.detachments?.[d.id]?.rules?.[a.id]) miss.push(`правило ${d.name}: ${a.name}`);
      for (const rid of f.armyRules ?? []) if (f.rules?.[rid]?.text?.trim() && !ru.rules?.[rid]) miss.push(`армейское правило ${f.rules[rid].name}`);
      for (const ds of f.datasheets) {
        const r = ru.datasheets?.[ds.id];
        for (const a of ds.abilities) {
          if (a.type === 'core' || !(a.ref ? f.rules?.[a.ref]?.text : a.text)?.trim()) continue;
          if (a.ref ? !ru.rules?.[a.ref] : !r?.abilities?.[a.name]) miss.push(`${ds.name}: ${a.name}`);
        }
        if (ds.loadout?.trim() && !r?.loadout) miss.push(`${ds.name}: снаряжение`);
        if (ds.leaderNote?.trim() && !r?.leaderNote) miss.push(`${ds.name}: лидер`);
      }
      expect(miss).toEqual([]);
    });
  }
});

describe('основные стратагемы и пояснение «Лидер» с wh-rules.ru', () => {
  test('снимок основных стратагем: 10 стратагем, отпечаток содержимого сходится', () => {
    const core = coreStratagems();
    expect(core.size).toBe(10);
    expect(core.get('fire overwatch')?.name).toBe('Упреждающий огонь');
    expect(core.get('heroic intervention')?.text).toContain('+1CP — Into the Fray (В гущу боя)');
  });
  test('«Лидер»: заголовок сайта + названия юнитов; исключение — footer сайта; иначе пробел', () => {
    const site = { text: 'Эту модель можно присоединить к следующим юнитам:', footer: 'Вы можете присоединить…' };
    expect(leaderNoteRu('This model can be attached to the following units: Assault Intercessor Squad, Intercessor Squad', site)).toBe(
      'Эту модель можно присоединить к следующим юнитам: Assault Intercessor Squad, Intercessor Squad',
    );
    expect(leaderNoteRu('You can attach this model to one of the above units even if…', site)).toBe('Вы можете присоединить…');
    expect(leaderNoteRu('You can attach this model…', { text: 'Эту модель можно присоединить к следующим юнитам:' })).toBeNull();
  });
});

describe('экраны берут русский текст по переключателю', () => {
  const src = (f: string) => fs.readFileSync(path.join(UI, f), 'utf8');
  test('Правила → Стратагемы', () => {
    const s = src('Rules.tsx');
    expect(s).toContain('useRu(');
    expect(s).toContain('ruStratagem(ru, s.id)');
  });
  test('карточка юнита: улучшения в выборе, «Лидер», пояснения вариантов снаряжения', () => {
    const s = src('UnitCard.tsx');
    expect(s).toContain('const re = ruEnhancement(ru, e.id)');
    expect(s).toContain('ruDatasheet(ru, ds.id)?.leaderNote');
    expect(s).toContain('optionTextsRu(ds, ruDatasheet(ru, ds.id)?.options)');
  });
  test('простой текст из разметки сайта и название «English (Русское)»', () => {
    expect(ruPlain('Цель получает **[gloss:benefit-of-cover:преимущество от укрытия]**, __не__ [core:Deep Strike].')).toBe(
      'Цель получает преимущество от укрытия, не Deep Strike.',
    );
    expect(ruName('Упреждающий огонь', 'FIRE OVERWATCH')).toBe('FIRE OVERWATCH (Упреждающий огонь)');
  });
});
