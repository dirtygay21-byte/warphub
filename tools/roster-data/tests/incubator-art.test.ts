/**
 * «Рой: инкубатор» (16.11.2026): на экране результата — картинка с запечённым контуром, без CSS drop-shadow
 * (в Android WebView фильтр давал чёрный прямоугольник с рамкой и полосой). Для каждого существа есть файл в result/,
 * обрезанный по содержимому (без пустых полей).
 */
import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..', '..', '..', 'client');
const ART = path.join(ROOT, 'public', 'games', 'incubator');

const pngSize = (f: string) => {
  const b = fs.readFileSync(f);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};

describe('картинки существ инкубатора на экране результата', () => {
  const names = fs.readdirSync(ART).filter((f) => f.endsWith('.png'));
  test('для каждого существа есть обрезанная картинка с контуром (×4)', () => {
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) {
      const f = path.join(ART, 'result', n);
      expect(fs.existsSync(f)).toBe(true);
      const { w, h } = pngSize(f);
      expect(w % 4).toBe(0);
      expect(h % 4).toBe(0);
      // обрезано: меньше исходного поля 44×56 с увеличением и контуром
      expect(w * h).toBeLessThan(46 * 58 * 16);
    }
  });
  test('результат без CSS drop-shadow и берёт картинку из result/', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src', 'components', 'games', 'EggGame.tsx'), 'utf8');
    expect(src).not.toContain('drop-shadow(');
    expect(src).toContain('/games/incubator/result/');
    // сцена вылупления — та же картинка (без старого тонированного контура)
    const scene = fs.readFileSync(path.join(ROOT, 'src', 'components', 'games', 'eggScene.ts'), 'utf8');
    expect(scene).not.toContain('tint: glow');
  });
});
