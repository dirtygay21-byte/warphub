import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { AOS_CORE_SOURCE, aosKeywordHint, aosWeaponHint, splitAosAbilities } from '../../../client/src/features/roster/aos/coreRules';

const DATA = path.join(import.meta.dir, '..', '..', '..', 'backend', 'roster-data', 'aos');

describe('AoS: способности оружия и ключевые слова открывают текст', () => {
  test('источник записан (BSData, коммит и дата)', () => {
    expect(AOS_CORE_SOURCE.url).toBe('https://github.com/BSData/age-of-sigmar-4th');
    expect(AOS_CORE_SOURCE.commit).toMatch(/^[0-9a-f]{40}$/);
  });
  test('основные способности оружия и варианты записи Anti-', () => {
    for (const a of ['Crit (Mortal)', 'Crit (Auto-wound)', 'Crit (2 Hits)', 'Companion', 'Charge (+1 Damage)', 'Shoot in Combat', 'Anti-MONSTER(+1 Rend)', 'Anti-charge (+1 Rend)'])
      expect(aosWeaponHint(a)?.text.length).toBeGreaterThan(20);
    expect(aosWeaponHint('Anti-HERO (+1 Rend)')!.name).toBe('Anti-HERO (+1 Rend)');
    expect(splitAosAbilities('-')).toEqual([]);
  });
  test('ключевые слова: FLY, WARD (5+), CHAMPION; прочие — без подсказки', () => {
    expect(aosKeywordHint('FLY')!.text).toContain('ignores other models');
    expect(aosKeywordHint('WARD', '5+')!.name).toBe('WARD (5+)');
    expect(aosKeywordHint('CHAMPION')).not.toBeNull();
    expect(aosKeywordHint('INFANTRY')).toBeNull();
  });
  test('все способности оружия в данных AoS находятся (основные или правило фракции)', () => {
    const missing = new Map<string, number>();
    for (const f of fs.readdirSync(path.join(DATA, 'f'))) {
      const d = JSON.parse(fs.readFileSync(path.join(DATA, 'f', f), 'utf8'));
      for (const w of [...d.warscrolls, ...(d.rorUnits ?? []), ...(d.universalManifestations ?? [])])
        for (const x of w.weapons)
          for (const a of splitAosAbilities(x.abilities))
            if (!aosWeaponHint(a, [...w.abilities, ...d.battleTraits])) missing.set(`${d.id}: ${a}`, (missing.get(`${d.id}: ${a}`) ?? 0) + 1);
    }
    console.log('без текста:', [...missing]);
    // пробелы: «Blood-hungry» (Khorne) и «Wyrdflame» (Tzeentch) — способности оружия фракций без отдельного правила
    // в данных Wahapedia и BSData; показываются текстом без подсказки. Новые пробелы должны всплыть здесь.
    expect([...missing.keys()].filter((k) => !/: (Blood-hungry|Wyrdflame)$/.test(k))).toEqual([]);
  });
});
