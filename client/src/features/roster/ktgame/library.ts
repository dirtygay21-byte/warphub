import { totalKtVp, type KtEvent, type KtState, type Seat } from './index';

export type KtSavedSummary = { names: Record<Seat, string>; mission: string; stage: KtState['stage']; round: number; score: Record<Seat, number> };
export type KtOnlineLink = { gameId: string; seat: Seat; code: string };
export type KtSavedEntry = {
  key: string;
  kind: 'local' | 'online';
  createdAt: string;
  updatedAt: string;
  summary: KtSavedSummary;
  online?: KtOnlineLink;
};

const INDEX = 'warphub.kt.library.v1';
const LEGACY = 'warphub.kt.game.v2';
const localKey = (id: string) => `warphub.kt.game.local.${id}`;
const sort = (list: KtSavedEntry[]) => [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
const read = (): KtSavedEntry[] => {
  try {
    const value = JSON.parse(localStorage.getItem(INDEX) ?? '[]') as unknown;
    return Array.isArray(value) ? value.filter((entry): entry is KtSavedEntry => !!entry && typeof entry.key === 'string' && (entry.kind === 'local' || entry.kind === 'online')) : [];
  } catch {
    return [];
  }
};
const write = (list: KtSavedEntry[]) => {
  const out = sort(list);
  while (out.length > 20) {
    const finished = out.findLastIndex((entry) => entry.summary.stage === 'finished');
    const drop = out.splice(finished >= 0 ? finished : out.length - 1, 1)[0]!;
    if (drop.kind === 'local') localStorage.removeItem(localKey(drop.key.slice(6)));
  }
  localStorage.setItem(INDEX, JSON.stringify(out));
};
const upsert = (entry: KtSavedEntry) => {
  const previous = read().find((item) => item.key === entry.key);
  write([...read().filter((item) => item.key !== entry.key), { ...entry, createdAt: previous?.createdAt ?? entry.createdAt }]);
};
const summary = (state: KtState): KtSavedSummary => ({
  names: { p1: state.players.p1.name, p2: state.players.p2.name },
  mission: state.missionId,
  stage: state.stage,
  round: state.round,
  score: { p1: totalKtVp(state, 'p1'), p2: totalKtVp(state, 'p2') },
});

export function readKtLibrary(): KtSavedEntry[] {
  const legacy = localStorage.getItem(LEGACY);
  if (legacy) {
    try {
      const events = JSON.parse(legacy) as KtEvent[];
      if (events.length) {
        saveKtLocal(events, null);
        localStorage.removeItem(LEGACY);
      }
    } catch {
      /* старое повреждённое сохранение остаётся на месте */
    }
  }
  return sort(read());
}

export function saveKtLocal(events: KtEvent[], state: KtState | null): void {
  const first = events[0];
  if (!first) return;
  localStorage.setItem(localKey(first.id), JSON.stringify(events));
  upsert({
    key: `local:${first.id}`,
    kind: 'local',
    createdAt: first.at,
    updatedAt: events.at(-1)!.at,
    summary: state ? summary(state) : { names: { p1: 'Игрок 1', p2: 'Игрок 2' }, mission: '', stage: 'setup', round: 1, score: { p1: 0, p2: 0 } },
  });
}

export function rememberKtOnline(link: KtOnlineLink, state: KtState): void {
  upsert({ key: `online:${link.gameId}`, kind: 'online', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), summary: summary(state), online: link });
}

export function readKtLocal(key: string): KtEvent[] {
  try {
    const raw = localStorage.getItem(`warphub.kt.game.local.${key.replace(/^local:/, '')}`);
    if (!raw) return [];
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value as KtEvent[] : [];
  } catch {
    return [];
  }
}

export function removeKtSaved(key: string): void {
  if (key.startsWith('local:')) localStorage.removeItem(localKey(key.slice(6)));
  write(read().filter((entry) => entry.key !== key));
}
