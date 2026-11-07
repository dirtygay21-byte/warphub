/**
 * Перевод WarpHub (решение владельца 06.11.2026): тексты 40K, которых нет на wh-rules.ru.
 * Сборка (пробелы, слияние, устаревание по отпечатку английского текста) и проверка файлов 40k/ru-warphub/<id>.json.
 */
import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { checkEntry, checkTranslation, collectGaps, enHash, keywordsOf, lostNames, mergeWarphub, numbersOf, readTranslation, WARPHUB_DIR } from '../scripts/ru-warphub-lib.mjs';
import { latestRuSnapshot, matchFaction } from '../scripts/whrules-ru.mjs';

const faction = {
  id: 'XX',
  name: 'Test',
  armyRules: ['r1'],
  rules: { r1: { name: 'Oath', text: 'Re-roll a Hit roll of 1.' } },
  datasheets: [
    {
      id: 'ds1',
      name: 'Squad',
      loadout: 'Every model is equipped with: bolt rifle.',
      options: [{ text: 'None' }],
      abilities: [
        { type: 'core', name: 'Deep Strike', text: '' },
        { type: 'datasheet', name: 'Hold', text: 'While this unit is within 6" of an objective, add 1 to the OC of INFANTRY models.' },
      ],
    },
  ],
  detachments: [{ id: 'd1', name: 'Host', abilities: [{ id: 'a1', name: 'Fury', text: 'Add 1 to Advance rolls.' }] }],
  stratagems: [{ id: 's1', detachment: 'd1', name: 'Strike', text: 'WHEN: Fight phase. EFFECT: +1 to Wound for D3 models.' }],
  enhancements: [{ id: 'e1', detachment: 'd1', name: 'Blade', text: 'Bearer has 4+ invulnerable save.' }],
};
const empty = () => ({ rules: {}, datasheets: {}, detachments: {}, stratagems: {}, enhancements: {} });

describe('пробелы: что есть по-английски и нет на wh-rules.ru', () => {
  test('собираются по id приложения, основные способности — нет', () => {
    const g = collectGaps(faction, empty());
    expect(Object.keys(g.rules)).toEqual(['r1']);
    expect(Object.keys(g.datasheets.ds1.abilities)).toEqual(['Hold']);
    expect(g.datasheets.ds1.loadout.source.text).toContain('bolt rifle');
    expect(g.datasheets.ds1.options).toBeUndefined(); // «None» не переводится
    expect(Object.keys(g.detachments.d1.rules)).toEqual(['a1']);
    expect(Object.keys(g.stratagems)).toEqual(['s1']);
    expect(Object.keys(g.enhancements)).toEqual(['e1']);
  });

  test('что есть на сайте — не пробел', () => {
    const ru = { ...empty(), stratagems: { s1: { text: 'с сайта' } }, datasheets: { ds1: { abilities: { Hold: { text: 'с сайта' } } } } };
    const g = collectGaps(faction, ru);
    expect(g.stratagems.s1).toBeUndefined();
    expect(g.datasheets.ds1).toBeUndefined(); // инфолист есть на сайте — снаряжение не переводится
  });
});

describe('слияние перевода в оверлей', () => {
  const tr = (extra = {}) => ({
    schema: 'warphub-ru-translation/1',
    faction: 'XX',
    stratagems: { s1: { en: enHash('Strike', faction.stratagems[0].text), name: 'Удар', text: 'КОГДА: фаза боя. ЭФФЕКТ: +1 к ранению для D3 моделей.' } },
    enhancements: { e1: { en: enHash('Blade', faction.enhancements[0].text), name: 'Клинок', text: 'Носитель имеет неуязвимый спасбросок 4+.', by: 'wh-rules' } },
    ...extra,
  });

  test('применяется с пометкой src: warphub; память wh-rules — без пометки', () => {
    const ru = empty();
    const s = mergeWarphub(faction, ru, tr());
    expect(s.applied).toBe(2);
    expect(ru.stratagems.s1).toEqual({ name: 'Удар', text: 'КОГДА: фаза боя. ЭФФЕКТ: +1 к ранению для D3 моделей.', src: 'warphub' });
    expect(ru.enhancements.e1.src).toBeUndefined();
  });

  test('английский текст изменился — перевод не применяется (устарел)', () => {
    const ru = empty();
    const s = mergeWarphub({ ...faction, stratagems: [{ ...faction.stratagems[0], text: 'WHEN: Shooting phase.' }] }, ru, tr());
    expect(ru.stratagems.s1).toBeUndefined();
    expect(s.stale).toEqual(['stratagem s1']);
  });

  test('текст сайта важнее; неизвестный id — в отчёт', () => {
    const ru = { ...empty(), stratagems: { s1: { text: 'с сайта' } } };
    const s = mergeWarphub(faction, ru, tr({ stratagems: { s1: tr().stratagems.s1, nope: { en: 'x', text: 'y' } } }));
    expect(ru.stratagems.s1.text).toBe('с сайта');
    expect(s.unknown).toEqual(['stratagem s1', 'stratagem nope']);
  });
});

describe('проверка перевода', () => {
  test('числа, кубы, дистанции и ключевые слова должны совпасть', () => {
    expect(numbersOf('within 6" and D3+1 models, 4+ save')).toEqual(['4+', '6"', 'D3+1']);
    expect(keywordsOf('INFANTRY and ADEPTUS ASTARTES models, PSYKER’s unit, CP')).toEqual(['ADEPTUS ASTARTES', 'INFANTRY', 'PSYKER']);
    const src = { name: 'Hold', text: 'Within 6" add 1 to the OC of INFANTRY models.' };
    expect(checkEntry(src, { name: 'Удержание', text: 'В пределах 6" добавьте 1 к OC моделей INFANTRY.' })).toEqual([]);
    expect(checkEntry(src, { name: 'Удержание', text: 'В пределах 3" добавьте 1 к OC моделей пехоты.' })).toEqual([
      'числа: «1 6"» ≠ «1 3"»',
      'нет ключевых слов: INFANTRY',
    ]);
    expect(checkEntry(src, { text: 'Within 6" add 1 to INFANTRY' })).toContain('нет русского текста');
  });
});

describe('названия в тексте — по-английски (решение 07.11.2026)', () => {
  const names = ['Oath of Moment', 'Anathema Psykana', 'Deep Strike'];
  test('название переведено вместо английского — замечание; в скобках после английского — порядок', () => {
    const en = 'Each time a unit with Oath of Moment uses Deep Strike…';
    expect(lostNames(names, en, 'Каждый раз, когда юнит с Клятвой момента использует Deep Strike…')).toEqual(['Oath of Moment']);
    expect(lostNames(names, en, 'Каждый раз, когда юнит с Oath of Moment (Клятва момента) использует Deep Strike…')).toEqual([]);
    expect(lostNames(names, 'An Anathema Psykana unit', 'Юнит ANATHEMA PSYKANA')).toEqual([]);
  });
});

describe('файлы перевода 40k/ru-warphub/', () => {
  const files = fs.existsSync(WARPHUB_DIR) ? fs.readdirSync(WARPHUB_DIR).filter((f) => f.endsWith('.json')) : [];
  const DATA = path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data');
  const { snap } = latestRuSnapshot();

  test('есть переводы', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const id = file.replace(/\.json$/, '');
    test(`${id}: все переводы проходят проверку, ни одного устаревшего`, () => {
      const data = JSON.parse(fs.readFileSync(path.join(DATA, 'f', `${id}.json`), 'utf8'));
      const res = checkTranslation(data, matchFaction(snap, data).ru, readTranslation(id));
      expect(res).toEqual([]);
    });
  }
});
