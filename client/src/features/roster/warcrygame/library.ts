import type { Seat, WcEvent, WcState } from './index';

export type WcSavedSummary = { names: Record<Seat, string>; battleplan: string; stage: WcState['stage']; round: number; score: Record<Seat, number> };
export type WcOnlineLink = { gameId: string; seat: Seat; code: string };
export type WcSavedEntry = {
  key: string;
  kind: 'local' | 'online';
  createdAt: string;
  updatedAt: string;
  summary: WcSavedSummary;
  online?: WcOnlineLink;
};

const INDEX = 'warphub.warcry.library.v1';
const LEGACY = 'warphub.warcry.game.v2';
const localKey = (id: string) => `warphub.warcry.game.local.${id}`;
const sort = (list: WcSavedEntry[]) => [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
const read = (): WcSavedEntry[] => {
  try {
    const value = JSON.parse(localStorage.getItem(INDEX) ?? '[]') as unknown;
    return Array.isArray(value) ? value.filter((entry): entry is WcSavedEntry => !!entry && typeof entry.key === 'string' && (entry.kind === 'local' || entry.kind === 'online')) : [];
  } catch {
    return [];
  }
};
const write = (list: WcSavedEntry[]) => {
  const out = sort(list);
  while (out.length > 20) {
    const finished = out.findLastIndex((entry) => entry.summary.stage === 'finished');
    const drop = out.splice(finished >= 0 ? finished : out.length - 1, 1)[0]!;
    if (drop.kind === 'local') localStorage.removeItem(localKey(drop.key.slice(6)));
  }
  localStorage.setItem(INDEX, JSON.stringify(out));
};
const upsert = (entry: WcSavedEntry) => {
  const previous = read().find((item) => item.key === entry.key);
  write([...read().filter((item) => item.key !== entry.key), { ...entry, createdAt: previous?.createdAt ?? entry.createdAt }]);
};
const summary = (state: WcState): WcSavedSummary => ({
  names: { p1: state.players.p1.name, p2: state.players.p2.name },
  battleplan: state.victoryId,
  stage: state.stage,
  round: state.round,
  score: { p1: state.players.p1.score, p2: state.players.p2.score },
});

export function readWarcryLibrary(): WcSavedEntry[] {
  const legacy = localStorage.getItem(LEGACY);
  if (legacy) {
    try {
      const events = JSON.parse(legacy) as WcEvent[];
      if (events.length) {
        saveWarcryLocal(events, null);
        localStorage.removeItem(LEGACY);
      }
    } catch {
      /* повреждённое старое сохранение остаётся на месте */
    }
  }
  return sort(read());
}

export function saveWarcryLocal(events: WcEvent[], state: WcState | null): void {
  const first = events[0];
  if (!first) return;
  localStorage.setItem(localKey(first.id), JSON.stringify(events));
  upsert({
    key: `local:${first.id}`,
    kind: 'local',
    createdAt: first.at,
    updatedAt: events.at(-1)!.at,
    summary: state ? summary(state) : { names: { p1: 'Игрок 1', p2: 'Игрок 2' }, battleplan: '', stage: 'setup', round: 1, score: { p1: 0, p2: 0 } },
  });
}

export function rememberWarcryOnline(link: WcOnlineLink, state: WcState): void {
  upsert({ key: `online:${link.gameId}`, kind: 'online', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), summary: summary(state), online: link });
}

export function readWarcryLocal(key: string): WcEvent[] {
  try {
    const raw = localStorage.getItem(`warphub.warcry.game.local.${key.replace(/^local:/, '')}`);
    if (!raw) return [];
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value as WcEvent[] : [];
  } catch {
    return [];
  }
}

export function removeWarcrySaved(key: string): void {
  if (key.startsWith('local:')) localStorage.removeItem(localKey(key.slice(6)));
  write(read().filter((entry) => entry.key !== key));
}
