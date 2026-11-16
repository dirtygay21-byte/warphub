/**
 * Фото армии (16.11.2026): какие фото показываются в ленте редактора и на карточке ростера (client/src/features/roster/photoList.ts),
 * и что строки юнитов и списки всех четырёх игр подключены.
 */
import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { photoItems, rosterCardPhotos } from '../../../client/src/features/roster/photoList';

const ROSTER_UI = path.resolve(import.meta.dir, '../../../client/src/features/roster/ui');
const read = (f: string) => fs.readFileSync(path.join(ROSTER_UI, f), 'utf8');

const items = [
  { key: '40k:a', name: 'Overlord', uid: '1' },
  { key: '40k:b', name: 'Immortals', uid: '2' },
  { key: '40k:b', name: 'Immortals', uid: '3' }, // вторая копия — то же фото
  { key: '40k:c', name: 'Warriors', uid: '4' },
  { key: '40k:d', name: 'Destroyers', uid: '5' },
];

describe('photoItems', () => {
  test('только юниты с фото, по одному на ключ, в порядке ростера', () => {
    const has = (k: string) => k !== '40k:c';
    expect(photoItems(items, has).map((i) => i.uid)).toEqual(['1', '2', '5']);
  });
  test('фото нет — пусто', () => {
    expect(photoItems(items, () => false)).toEqual([]);
  });
});

describe('rosterCardPhotos', () => {
  test('до max фото, остаток и юниты без фото', () => {
    const r = rosterCardPhotos(items, (k) => k !== '40k:c', 2);
    expect(r.shown.map((i) => i.key)).toEqual(['40k:a', '40k:b']);
    expect(r.more).toBe(1);
    expect(r.without).toBe(1);
  });
  test('все фото помещаются — остатка нет', () => {
    const r = rosterCardPhotos(items, () => true);
    expect(r.shown).toHaveLength(4);
    expect(r.more).toBe(0);
    expect(r.without).toBe(0);
  });
});

describe('подключение во всех играх', () => {
  test('строки юнитов открывают фото без раскрытия карточки (кнопка вне кнопки раскрытия)', () => {
    for (const f of ['UnitCard.tsx', 'aos/AosUnitCard.tsx', 'common/BuilderKit.tsx']) {
      const s = read(f);
      expect(s).toContain('<UnitThumbButton');
      expect(s).not.toMatch(/<UnitThumb\s/);
    }
  });
  test('редакторы: лента «Фото армии» и просмотр с переходом к карточке', () => {
    for (const f of ['RosterEditor.tsx', 'aos/AosEditor.tsx', 'kt/KtEditor.tsx', 'warcry/WarcryEditor.tsx']) {
      const s = read(f);
      expect(s).toContain('<RosterPhotos items={photoList} onOpenCard=');
      expect(s).toContain('<PhotoStrip />');
    }
  });
  test('списки ростеров: ряд фото на карточке', () => {
    expect(read('RosterList.tsx')).toContain('<RosterCardPhotos');
    expect(read('common/BuilderKit.tsx')).toContain('<RosterCardPhotos');
    for (const [f, game] of [['aos/AosList.tsx', 'aos'], ['kt/KtList.tsx', 'kt'], ['warcry/WarcryList.tsx', 'warcry']]) {
      expect(read(f)).toContain(`photos={`);
      expect(read(f)).toContain(`photoKey('${game}'`);
    }
  });
});
