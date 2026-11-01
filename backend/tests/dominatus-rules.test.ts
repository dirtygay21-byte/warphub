// Кампания Dominatus (DM2): правила без БД — награды битвы, предел Agenda Achieved, контроль, Ascendancy, Relics, Narrative Points.
import { describe, expect, test } from 'bun:test';
import { agendaToAdd, battleAwards, leaders, narrativePoints, relicDraw, resultOf, takeControl } from '../src/modules/dominatus/rules';

describe('Dominatus: награды битвы', () => {
  test('фазы 1–2: победитель — Battle Honour, проигравший — Battle Skill; с Agenda Achieved — на карту больше', () => {
    expect(battleAwards(1, 'p1', [0, 0])).toEqual([{ kind: 'honour', draw: 1 }, { kind: 'skill', draw: 1 }]);
    expect(battleAwards(2, 'p2', [1, 2])).toEqual([{ kind: 'skill', draw: 2 }, { kind: 'honour', draw: 2 }]);
  });
  test('ничья — оба Battle Skill', () => {
    expect(battleAwards(1, 'draw', [0, 1])).toEqual([{ kind: 'skill', draw: 1 }, { kind: 'skill', draw: 2 }]);
  });
  test('фаза 3: победителю Path to Conquest, остальным ничего', () => {
    expect(battleAwards(3, 'p2', [1, 1])).toEqual([null, { kind: 'honour', draw: 1, fixed: 'Path to Conquest' }]);
    expect(battleAwards(3, 'draw', [0, 0])).toEqual([null, null]);
  });
  test('итог по ПО', () => {
    expect(resultOf(80, 72)).toBe('p1');
    expect(resultOf(60, 60)).toBe('draw');
  });
});

describe('Dominatus: конец фазы', () => {
  test('Agenda Achieved — не больше 3', () => {
    expect(agendaToAdd(0, 2)).toBe(2);
    expect(agendaToAdd(2, 2)).toBe(1);
    expect(agendaToAdd(3, 1)).toBe(0);
  });
  test('контроль: больше Battle Honour за фазу; ничья — за кампанию; дальше — Warmaster', () => {
    expect(takeControl({ liberators: 3, oppressors: 2 }, {})).toEqual({ controller: 'liberators', tied: [] });
    expect(takeControl({ liberators: 2, oppressors: 2 }, { liberators: 5, oppressors: 4 })).toEqual({ controller: 'liberators', tied: [] });
    expect(takeControl({ liberators: 2, oppressors: 2 }, { liberators: 4, oppressors: 4 })).toEqual({ controller: null, tied: ['liberators', 'oppressors'] });
    expect(takeControl({ liberators: 2, oppressors: 2 }, { liberators: 4, oppressors: 4 }, 'oppressors').controller).toBe('oppressors');
    expect(takeControl({}, {})).toEqual({ controller: null, tied: [] });
  });
  test('Ascendancy: все альянсы с максимумом Agenda Achieved', () => {
    expect(leaders({ liberators: 2, oppressors: 2, raiders: 1 })).toEqual(['liberators', 'oppressors']);
    expect(leaders({})).toEqual([]);
  });
  test('Narrative Points: контроль +1 (фаза 3 +2), Ascendancy +1', () => {
    expect(narrativePoints(1, 'liberators', ['liberators'])).toEqual({ liberators: 2 });
    expect(narrativePoints(3, 'oppressors', ['raiders'])).toEqual({ oppressors: 2, raiders: 1 });
  });
  test('Relics: по числу Agenda Achieved, в фазе 3 — нет', () => {
    expect(relicDraw(1, 2)).toBe(2);
    expect(relicDraw(2, 5)).toBe(3);
    expect(relicDraw(3, 2)).toBe(0);
  });
});
