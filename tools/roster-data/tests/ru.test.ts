// Русские тексты 40K с wh-rules.ru (01.11.2026): оверлеи backend/roster-data/ru/<фракция>.json собраны из снимка без ручных правок,
// ссылаются только на существующие id приложения, ссылки на термины — на термины глоссария; покрытие не падает.
import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { buildOverlays, latestRuSnapshot, splitArmyRule, stratagemText } from '../scripts/whrules-ru.mjs';

const DATA = path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data');
const { file, snap } = latestRuSnapshot();
const overlays = buildOverlays(snap, file);
const glossary = JSON.parse(fs.readFileSync(path.join(DATA, 'glossary.json'), 'utf8'));
const coverage = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', '40k', 'ru-coverage.json'), 'utf8'));

describe('оверлеи ru/', () => {
  test('файлы совпадают со сборкой из снимка (scripts/whrules-ru.mjs --apply)', () => {
    const files = fs.readdirSync(path.join(DATA, 'ru')).filter((f) => f.endsWith('.json'));
    expect(files.sort()).toEqual(Object.keys(overlays).map((id) => `${id}.json`).sort());
    for (const [id, o] of Object.entries(overlays)) expect(JSON.parse(fs.readFileSync(path.join(DATA, 'ru', `${id}.json`), 'utf8'))).toEqual(o);
  });

  test('ссылаются только на существующие инфолисты, способности, детачменты, стратагемы, улучшения и правила', () => {
    for (const [id, o] of Object.entries(overlays)) {
      const f = JSON.parse(fs.readFileSync(path.join(DATA, 'f', `${id}.json`), 'utf8'));
      const ds = new Map(f.datasheets.map((d: { id: string }) => [d.id, d]));
      for (const [dsId, e] of Object.entries(o.datasheets ?? {}) as [string, { abilities?: Record<string, unknown> }][]) {
        const d = ds.get(dsId) as { abilities: { name: string }[] } | undefined;
        expect(d).toBeDefined();
        for (const name of Object.keys(e.abilities ?? {})) expect(d!.abilities.some((a) => a.name === name)).toBe(true);
      }
      const dets = new Map(f.detachments.map((d: { id: string }) => [d.id, d]));
      for (const [detId, e] of Object.entries(o.detachments ?? {}) as [string, { rules?: Record<string, unknown> }][]) {
        const d = dets.get(detId) as { abilities?: { id: string }[] } | undefined;
        expect(d).toBeDefined();
        for (const rid of Object.keys(e.rules ?? {})) expect(d!.abilities?.some((a) => a.id === rid)).toBe(true);
      }
      for (const sid of Object.keys(o.stratagems ?? {})) expect(f.stratagems.some((s: { id: string }) => s.id === sid)).toBe(true);
      for (const eid of Object.keys(o.enhancements ?? {})) expect(f.enhancements.some((e: { id: string }) => e.id === eid)).toBe(true);
      for (const rid of Object.keys(o.rules ?? {})) expect(f.rules[rid]).toBeDefined();
    }
  });

  test('ссылки [gloss:id] в русских текстах — на термины глоссария', () => {
    const missing = new Set<string>();
    for (const o of Object.values(overlays)) for (const m of JSON.stringify(o).matchAll(/\[gloss:([^:\]]+):/g)) if (!glossary.terms[m[1]!]) missing.add(m[1]!);
    expect([...missing]).toEqual([]);
  });

  test('покрытие не ниже текущего (версия данных 995: 01.11.2026)', () => {
    const pct = (k: string) => coverage.total[k].ru / coverage.total[k].total;
    expect(pct('datasheets')).toBeGreaterThanOrEqual(0.95);
    expect(pct('abilities')).toBeGreaterThanOrEqual(0.9);
    expect(pct('factionAbilities')).toBeGreaterThanOrEqual(0.9);
    expect(pct('armyRules')).toBeGreaterThanOrEqual(0.85);
    expect(pct('detachments')).toBeGreaterThanOrEqual(0.85);
    expect(pct('stratagems')).toBeGreaterThanOrEqual(0.8);
    expect(pct('enhancements')).toBeGreaterThanOrEqual(0.75);
  });
});

describe('разбор текстов сайта', () => {
  test('армейское правило: основной текст и разделы «### English | Русское»', () => {
    const r = splitArmyRule('Основной текст.\n\n### Da Boss | Босс\nПолучите 1CP.\n\n### Special Move Types\nТекст.');
    expect(r.main).toBe('Основной текст.');
    expect(r.sections).toEqual([
      { en: 'Da Boss', ru: 'Босс', text: 'Получите 1CP.' },
      { en: 'Special Move Types', ru: null, text: 'Текст.' },
    ]);
  });
  test('стратагема: подписи как на wh-rules.ru', () => {
    expect(stratagemText({ when: 'Фаза движения.', target: 'Юнит.', effect: 'Эффект.', restrictions: 'Раз за битву.' })).toBe(
      'КОГДА: Фаза движения.\n\nЦЕЛЬ: Юнит.\n\nЭФФЕКТ: Эффект.\n\nОГРАНИЧЕНИЯ: Раз за битву.',
    );
  });
});
