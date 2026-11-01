// Dominatus (DM0, 31.10.2026): backend/roster-data/dominatus.json — структура, названия как на сайте Dominatus владельца,
// локации по D6, карты Agenda считаются движком «Начать игру» (cardVp).
import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { cardVp } from '../../../client/src/features/roster/game/scoring';
import type { CatalogCard } from '../../../client/src/features/roster/game/types';
import { agendasFor, locationForRoll, upgradeLimit, type DominatusData } from '../../../client/src/features/roster/dominatus/types';

const data: DominatusData = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data', 'dominatus.json'), 'utf8'));
const missions = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data', 'missions.json'), 'utf8'));

// названия Agenda из каталога сайта Dominatus (src/lib/dominatus/catalogue.ts, сверено с правилами владельца)
const SITE_AGENDAS: Record<string, string[]> = {
  liberators: ['Planetfall', 'Vital Strongpoint', 'Secure Perimeter', 'Rescue Survivors', 'Encirclement', 'Hidden Prize', 'Cast Down Their Idols', 'Reclaim This World', 'Slay the Tyrant'],
  oppressors: ['Loot and Scoot', 'Dig In', 'Repel the Foe', 'Breakthrough', 'Convoy Ambush', 'Sabotage Supplies', 'Lead by Example', 'Ash and Rubble', 'A Proper Challenge'],
  raiders: ['Clandestine Infiltration', 'Vanguard Recon', 'Establish Contact', 'A Knife in the Dark', 'A Thief in the Night', 'Seeds of Destruction', 'Erase All Trace', 'Extraction', 'Capture Trophies'],
};
const PHASE_OF: Record<string, number> = {};
for (const names of Object.values(SITE_AGENDAS)) names.forEach((n, i) => (PHASE_OF[n] = Math.floor(i / 3) + 1));
// Oppressors фазы 1: на сайте и в Wahapedia один набор, порядок разный — сравниваем множествами

describe('Dominatus: данные кампании', () => {
  test('схема, источник, лимиты как у колоды миссий', () => {
    expect(data.schema).toBe('warphub-dominatus/1');
    expect(data.source.rules).toContain('wahapedia.ru');
    expect(data.caps).toEqual(missions.caps);
    expect(data.battleSize.points).toBe(2000);
    expect(data.phases.map((p) => p.battles)).toEqual([2, 2, 1]);
    expect(data.alliances.map((a) => a.id)).toEqual(['liberators', 'oppressors', 'raiders']);
    expect(data.alliances.find((a) => a.id === 'raiders')!.optional).toBe(true);
  });

  test('27 Agenda: по 3 на альянс и фазу, названия как на сайте Dominatus', () => {
    expect(data.cards).toHaveLength(27);
    for (const a of data.alliances) {
      for (const phase of [1, 2, 3] as const) {
        const names = agendasFor(data, a.id, phase).map((c) => c.name);
        expect(names).toHaveLength(3);
        for (const n of names) expect(PHASE_OF[n]).toBe(phase);
      }
      expect(new Set(data.cards.filter((c) => c.alliance === a.id).map((c) => c.name))).toEqual(new Set(SITE_AGENDAS[a.id]));
    }
    expect(new Set(data.cards.map((c) => c.id)).size).toBe(27);
  });

  test('каждая Agenda: первое условие — 35+ ПО, у строк есть текст и ПО, моменты подсчёта известны', () => {
    const at = new Set(['own-turn', 'own-command', 'own-command-r5-turn', 'any-turn', 'battle-end', 'round-end']);
    for (const c of data.cards) {
      expect(c.type).toBe('primary');
      expect(c.achieved[0]).toContain('35+');
      expect(c.blocks.length).toBeGreaterThan(0);
      for (const b of c.blocks) {
        expect(at.has(b.at!)).toBe(true);
        expect(b.when.length).toBeGreaterThan(0);
        if (b.rounds === 'end') expect(b.at).toBe('battle-end');
        for (const r of b.rows) {
          expect(r.text.length).toBeGreaterThan(5);
          expect(Number.isInteger(r.vp) && r.vp > 0).toBe(true);
        }
      }
    }
  });

  test('Agenda считаются движком: Loot and Scoot, Repel the Foe (+), Establish Contact (или)', () => {
    const card = (id: string) => data.cards.find((c) => c.id === id) as unknown as CatalogCard;
    // конец битвы: 3 разграбленные цели × 7 + 2 маркера на отрядах × 3
    expect(cardVp({ card: card('dom-loot-and-scoot'), picks: [{ block: 1, row: 0, count: 3 }, { block: 1, row: 1, count: 2 }], round: 5, endOfBattle: true })).toEqual({ vp: 27 });
    // 2-й раунд: 3 цели × 2 и сверх того 2 на территории противника × 3
    expect(cardVp({ card: card('dom-repel-the-foe'), picks: [{ block: 1, row: 0, count: 3 }, { block: 1, row: 1, count: 2 }], round: 2 })).toEqual({ vp: 12 });
    // агент: либо 8, либо 15 — вместе нельзя
    expect(cardVp({ card: card('dom-establish-contact'), picks: [{ block: 1, row: 1, count: 1 }], round: 5, endOfBattle: true })).toEqual({ vp: 15 });
    expect('error' in cardVp({ card: card('dom-establish-contact'), picks: [{ block: 1, row: 0, count: 1 }, { block: 1, row: 1, count: 1 }], round: 5, endOfBattle: true })).toBe(true);
    // блок «со 2-го раунда» в 1-м раунде не засчитывается
    expect('error' in cardVp({ card: card('dom-dig-in'), picks: [{ block: 1, row: 0, count: 1 }], round: 1 })).toBe(true);
  });

  test('локации: 9, по три на фазу, D6 1–6 покрыт; Titangrave — 4 улучшения', () => {
    expect(data.locations).toHaveLength(9);
    for (const phase of [1, 2, 3] as const) {
      const ids = [1, 2, 3, 4, 5, 6].map((roll) => locationForRoll(data, phase, roll)?.id);
      expect(ids.every(Boolean)).toBe(true);
      expect(new Set(ids).size).toBe(3);
    }
    expect(locationForRoll(data, 2, 1)!.name).toBe('Cerbera Base');
    expect(upgradeLimit(data, 'titangrave')).toBe(4);
    expect(upgradeLimit(data, 'mannheim-gap')).toBe(3);
  });

  test('карты улучшений: Honour 5/5/1 (Path to Conquest), Relic по 5 на альянс, без повторов', () => {
    expect(data.upgrades.honours['1']).toHaveLength(5);
    expect(data.upgrades.honours['2']).toHaveLength(5);
    expect(data.upgrades.honours['3']).toEqual(['Path to Conquest']);
    for (const a of data.alliances) expect(data.upgrades.relics[a.id]).toHaveLength(5);
    const all = [...Object.values(data.upgrades.honours).flat(), ...data.upgrades.skills, ...Object.values(data.upgrades.relics).flat()];
    expect(new Set(all).size).toBe(all.length);
  });
});
