// Небольшие помощники для экранов Roster Builder (отдельно от компонентов — для быстрого обновления в Vite).
export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export const fmtPts = (n: number) => n.toLocaleString('ru-RU');
