import type { Side, TAArmy } from './state';

/**
 * Цвета армий на столе Test Army (27.11.2026, стиль battle report): армия красится целиком — базы, зона деплоя,
 * полоса «Вне стола», табличка с названием. Цвет выбирает игрок; по умолчанию атакующий — красный, защитник — синий.
 */
export const ARMY_COLORS = [
  { id: 'blue', hex: '#2f7cf6', name: 'Синий' },
  { id: 'red', hex: '#e5383b', name: 'Красный' },
  { id: 'green', hex: '#2bb24c', name: 'Зелёный' },
  { id: 'yellow', hex: '#f2b705', name: 'Жёлтый' },
  { id: 'purple', hex: '#9b51e0', name: 'Фиолетовый' },
  { id: 'orange', hex: '#f2711c', name: 'Оранжевый' },
  { id: 'teal', hex: '#14b8a6', name: 'Бирюзовый' },
  { id: 'grey', hex: '#8a94a6', name: 'Серый' },
] as const;

const DEFAULT: Record<Side, string> = { attacker: '#e5383b', defender: '#2f7cf6' };

/** Цвет армии: выбранный (если такой есть в палитре) или цвет стороны; у двух армий одного цвета вторая берёт другой. */
export function armyColor(army: Pick<TAArmy, 'side' | 'color'>, other?: Pick<TAArmy, 'side' | 'color'> | null): string {
  const own = ARMY_COLORS.some((c) => c.hex === army.color) ? army.color! : DEFAULT[army.side];
  if (!other) return own;
  const theirs = ARMY_COLORS.some((c) => c.hex === other.color) ? other.color! : DEFAULT[other.side];
  if (own !== theirs || army.side === 'attacker') return own;
  return own === DEFAULT.defender ? DEFAULT.attacker : DEFAULT.defender;
}

/** Случайное значение из распределения (p[k] — вероятность k); для броска по результату симулятора. */
export function sampleDist(p: number[], r: number = Math.random()): number {
  let acc = 0;
  for (let k = 0; k < p.length; k++) {
    acc += p[k]!;
    if (r < acc) return k;
  }
  return Math.max(0, p.length - 1);
}
