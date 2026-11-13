/**
 * Прогресс «Как играть» (13.11.2026): обучающая игра (раунд по шагам) открывается после того, как карточки «Как играть»
 * этой игры пролистаны до последней. Хранится на устройстве; хранилище недоступно — считаем, что не пройдено.
 */
const KEY = "warphub.learn.done.v1";

function read(): Record<string, true> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as unknown;
    return v && typeof v === "object" ? (v as Record<string, true>) : {};
  } catch {
    return {};
  }
}

/** Карточки «Как играть» игры пролистаны до конца. */
export function learnDone(gameId: string): boolean {
  return read()[gameId] === true;
}

export function markLearnDone(gameId: string): void {
  try {
    const v = read();
    if (v[gameId]) return;
    localStorage.setItem(KEY, JSON.stringify({ ...v, [gameId]: true }));
  } catch {
    /* хранилище недоступно — обучающая игра останется закрытой до следующего прохождения */
  }
}
