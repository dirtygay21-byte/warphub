// Небольшие помощники для экранов Roster Builder (отдельно от компонентов — для быстрого обновления в Vite).
export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export const fmtPts = (n: number) => n.toLocaleString('ru-RU');
/** Русское склонение по числу: plural(3, ['ростер', 'ростера', 'ростеров']). */
export const plural = (n: number, [one, few, many]: [string, string, string]) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
