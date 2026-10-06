// Хранение ростеров: Telegram CloudStorage (синхронизация между устройствами) + localStorage (кэш/офлайн).
// Лимиты CloudStorage: значение ≤ 4096 символов, ключей ≤ 1024 — длинные ростеры режем на куски.
import { cloudStorage, tg } from './telegram';
import { sanitizeRoster } from './engine/roster';
import type { Roster } from './engine/types';

// Ключи localStorage — свои у каждого аккаунта Telegram (на одном компьютере может быть несколько аккаунтов).
const userSuffix = tg?.initDataUnsafe.user?.id ? `.${tg.initDataUnsafe.user.id}` : '';
const LEGACY_KEY = 'warphub.rosters.v1';
const LEGACY_DEL = 'warphub.rosters.deleted.v1';
const LS_KEY = LEGACY_KEY + userSuffix;
const LS_DEL = LEGACY_DEL + userSuffix;
// перенос со старых общих ключей (до разделения по аккаунтам) — один раз
try {
  if (userSuffix && localStorage.getItem(LS_KEY) === null && localStorage.getItem(LEGACY_KEY) !== null) {
    localStorage.setItem(LS_KEY, localStorage.getItem(LEGACY_KEY)!);
    localStorage.setItem(LS_DEL, localStorage.getItem(LEGACY_DEL) ?? '[]');
    localStorage.removeItem(LEGACY_KEY);
    localStorage.removeItem(LEGACY_DEL);
  }
} catch {
  /* приватный режим */
}
const clean = (list: unknown): Roster[] => (Array.isArray(list) ? list.map(sanitizeRoster).filter((r): r is Roster => !!r) : []);
const DEL_KEY = 'rb_deleted';
const CHUNK = 3800;
const INDEX_KEY = 'rb_index';
const chunkKey = (id: string, i: number) => `rb_${id}_${i}`;

type IndexEntry = { id: string; chunks: number; updatedAt: number };

function readLocal(): Roster[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? clean(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}
function writeLocal(list: Roster[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch {
    /* приватный режим и т.п. */
  }
}

function readDeleted(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LS_DEL) ?? '[]');
  } catch {
    return [];
  }
}
/** «Надгробия» удалённых ростеров, чтобы другое устройство не вернуло их при слиянии. */
export function markDeleted(id: string) {
  const list = [...readDeleted().filter((x) => x !== id), id].slice(-300);
  try {
    localStorage.setItem(LS_DEL, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  const c = cs();
  if (c) c.setItem(DEL_KEY, JSON.stringify(list));
}

const cs = () => cloudStorage();
/** Вызов CloudStorage как промис; если Telegram не ответил за 8 с — ошибка (дальше работаем с локальной копией). */
const p = <T>(fn: (cb: (err: string | null, v?: T) => void) => void) =>
  new Promise<T | undefined>((res, rej) => {
    const t = setTimeout(() => rej(new Error('CloudStorage: нет ответа')), 8000);
    fn((err, v) => (clearTimeout(t), err ? rej(new Error(err)) : res(v)));
  });

async function readCloud(): Promise<Roster[] | null> {
  const c = cs();
  if (!c) return null;
  const idxRaw = await p<string>((cb) => c.getItem(INDEX_KEY, cb));
  if (!idxRaw) return [];
  const index = JSON.parse(idxRaw) as IndexEntry[];
  const keys = index.flatMap((e) => Array.from({ length: e.chunks }, (_, i) => chunkKey(e.id, i)));
  const values: Record<string, string> = {};
  for (let i = 0; i < keys.length; i += 50) Object.assign(values, await p<Record<string, string>>((cb) => c.getItems(keys.slice(i, i + 50), cb)));
  const out: Roster[] = [];
  for (const e of index) {
    try {
      const json = Array.from({ length: e.chunks }, (_, i) => values[chunkKey(e.id, i)] ?? '').join('');
      const r = sanitizeRoster(JSON.parse(json));
      if (r) out.push(r);
    } catch {
      /* битая запись — пропускаем */
    }
  }
  return out;
}

async function writeCloud(list: Roster[], prevIndex: IndexEntry[]) {
  const c = cs();
  if (!c) return prevIndex;
  const index: IndexEntry[] = [];
  for (const r of list) {
    const json = JSON.stringify(r);
    const n = Math.max(1, Math.ceil(json.length / CHUNK));
    const prev = prevIndex.find((e) => e.id === r.id);
    if (!prev || prev.updatedAt !== r.updatedAt || prev.chunks !== n) {
      for (let i = 0; i < n; i++) await p((cb) => c.setItem(chunkKey(r.id, i), json.slice(i * CHUNK, (i + 1) * CHUNK), cb));
      if (prev && prev.chunks > n) await p((cb) => c.removeItems(Array.from({ length: prev.chunks - n }, (_, i) => chunkKey(r.id, n + i)), cb));
    }
    index.push({ id: r.id, chunks: n, updatedAt: r.updatedAt });
  }
  const removed = prevIndex.filter((e) => !list.some((r) => r.id === e.id));
  for (const e of removed) await p((cb) => c.removeItems(Array.from({ length: e.chunks }, (_, i) => chunkKey(e.id, i)), cb));
  await p((cb) => c.setItem(INDEX_KEY, JSON.stringify(index), cb));
  return index;
}

let cloudIndex: IndexEntry[] = [];
let queue: Promise<unknown> = Promise.resolve();

export async function loadRosters(): Promise<Roster[]> {
  const local = readLocal();
  try {
    const cloud = await readCloud();
    if (cloud) {
      const c = cs()!;
      const remoteDel = JSON.parse((await p<string>((cb) => c.getItem(DEL_KEY, cb))) || '[]') as string[];
      const deleted = new Set([...readDeleted(), ...remoteDel]);
      cloudIndex = cloud.map((r) => ({ id: r.id, chunks: Math.max(1, Math.ceil(JSON.stringify(r).length / CHUNK)), updatedAt: r.updatedAt }));
      // слияние: побеждает более свежая версия
      const map = new Map<string, Roster>();
      for (const r of [...local, ...cloud]) {
        const prev = map.get(r.id);
        if (!prev || prev.updatedAt < r.updatedAt) map.set(r.id, r);
      }
      const merged = [...map.values()].filter((r) => !deleted.has(r.id)).sort((a, b) => b.updatedAt - a.updatedAt);
      if (remoteDel.length) {
        try {
          localStorage.setItem(LS_DEL, JSON.stringify([...deleted].slice(-300)));
        } catch {
          /* ignore */
        }
      }
      writeLocal(merged);
      if (merged.length !== cloud.length || merged.some((r) => !cloud.find((c) => c.id === r.id && c.updatedAt === r.updatedAt))) saveRosters(merged);
      return merged;
    }
  } catch (e) {
    console.warn('CloudStorage недоступен', e);
  }
  const deleted = new Set(readDeleted());
  return local.filter((r) => !deleted.has(r.id)).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Сохраняет весь список локально (сразу, синхронно). */
export function saveLocal(list: Roster[]) {
  writeLocal(list);
}

/** Сохраняет весь список (локально сразу, в облако — последовательно в фоне). */
export function saveRosters(list: Roster[]) {
  writeLocal(list);
  queue = queue
    .then(async () => {
      cloudIndex = await writeCloud(list, cloudIndex);
    })
    .catch((e) => console.warn('Не удалось сохранить в CloudStorage', e));
}

export const cloudEnabled = () => !!cs();
