/**
 * Переключатель RU/EN WarpBuilder 40K, этап A (16.11.2026, владелец: «на английском — всё на английском, на русском —
 * всё на русском»): сообщения проверки ростера и подписи вариантов снаряжения следуют языку; RU-пробелы данных
 * (состав отряда, пометка к неуязвимому спасброску) показываются по-русски; общие экраны 40K подключены к языку.
 */
import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { computeRoster, makeLookup } from '../../../client/src/features/roster/engine/compute';
import { addUnit, newRoster } from '../../../client/src/features/roster/engine/roster';
import type { FactionData } from '../../../client/src/features/roster/engine/types';
import { compositionRu, invulnNoteRu, allyNoteEn } from '../../../client/src/features/roster/ui/unitTextRu';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');
const DATA = path.join(ROOT, 'backend', 'roster-data');
const UI = path.join(ROOT, 'client', 'src', 'features', 'roster', 'ui');
const CYR = /[А-Яа-яЁё]/;

describe('сообщения проверки ростера на выбранном языке', () => {
  const SM = JSON.parse(fs.readFileSync(path.join(DATA, 'f', 'SM.json'), 'utf8')) as FactionData;
  const L = makeLookup(SM);
  // ростер с нарушениями: без детачмента, без Warlord, перебор копий
  let r = newRoster('SM');
  const ds = SM.datasheets.find((d) => d.character && !d.epicHero && d.costs.length)!;
  for (let i = 0; i < 5; i++) r = addUnit(r, ds);

  test('en — без кириллицы, ru — по-русски, коды те же', () => {
    const en = computeRoster(r, L, 'en');
    const ru = computeRoster(r, L, 'ru');
    expect(en.issues.length).toBeGreaterThan(1);
    expect(en.issues.map((i) => i.code)).toEqual(ru.issues.map((i) => i.code));
    for (const i of en.issues) expect(i.message).not.toMatch(CYR);
    expect(ru.issues.some((i) => CYR.test(i.message))).toBe(true);
  });
  test('по умолчанию — русский (старые вызовы не меняются)', () => {
    expect(computeRoster(r, L).issues.map((i) => i.message)).toEqual(computeRoster(r, L, 'ru').issues.map((i) => i.message));
  });
});

describe('мелкие поля инфолиста по-русски', () => {
  test('состав отряда', () => {
    expect(compositionRu(['1 Captain model', '4-9 Intercessor models', '1 Cyber-mastiff'])).toEqual(['Captain — 1 модель', 'Intercessor — 4–9 моделей', '1 Cyber-mastiff']);
  });
  test('пометка к неуязвимому спасброску — все варианты в данных переведены', () => {
    const notes = new Set<string>();
    for (const fn of fs.readdirSync(path.join(DATA, 'f'))) {
      const f = JSON.parse(fs.readFileSync(path.join(DATA, 'f', fn), 'utf8')) as FactionData;
      for (const d of f.datasheets) if (d.invulnNote) notes.add(d.invulnNote);
    }
    for (const n of notes) expect(invulnNoteRu(n)).toMatch(CYR);
  });
  test('пояснения к союзникам — по-английски для EN', () => {
    for (const fn of fs.readdirSync(path.join(DATA, 'f'))) {
      const f = JSON.parse(fs.readFileSync(path.join(DATA, 'f', fn), 'utf8')) as FactionData;
      for (const a of f.allies ?? []) if (a.note) expect(allyNoteEn(a.note)).not.toMatch(CYR);
    }
  });
});

describe('экраны редактора 40K подключены к языку', () => {
  const read = (f: string) => fs.readFileSync(path.join(UI, f), 'utf8');
  test('список, редактор и «Правила» — внутри Lang40k; переключатель в шапке', () => {
    const app = read('App.tsx');
    expect(app.match(/<Lang40k\.Provider value>/g)?.length).toBe(3);
    for (const f of ['RosterList.tsx', 'RosterEditor.tsx', 'Rules.tsx']) expect(read(f)).toContain('<LangSwitch />');
  });
  test('подсказка правила (глоссарий) — на языке экрана', () => {
    expect(read('common/RulePopover.tsx')).toContain('localizeGlossary(raw');
  });
  test('JSX-текст экранов редактора без голого русского текста', () => {
    // строки вида >Русский текст< без t(…) — признак непереведённого места
    for (const f of ['RosterEditor.tsx', 'UnitCard.tsx', 'UnitPicker.tsx', 'DetachmentPanel.tsx', 'Rules.tsx', 'ExportSheet.tsx', 'BattleSheet.tsx', 'RosterList.tsx', 'PointsSheet.tsx']) {
      const bare = read(f)
        .split('\n')
        .filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l))
        .filter((l) => />[^<{}]*[А-Яа-яЁё][^<{}]*</.test(l) || /\b(label|title|placeholder|aria-label)="[^"]*[А-Яа-яЁё]/.test(l));
      expect({ f, bare }).toEqual({ f, bare: [] });
    }
  });
});
