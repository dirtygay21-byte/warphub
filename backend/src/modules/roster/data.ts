import fs from 'node:fs';
import path from 'node:path';

// ---------- данные Wahapedia для Roster Builder ----------

/**
 * Папка с index.json, battlefield.json, missions.json и f/<фракция>.json (генерирует tools/roster-data).
 * ROSTER_DATA_DIR, иначе backend/roster-data рядом с кодом — не зависит от того, из какой папки запущен сервер.
 */
export function rosterDataDir(): string {
  if (process.env.ROSTER_DATA_DIR) return process.env.ROSTER_DATA_DIR;
  const nearCode = path.resolve(import.meta.dir, '../../../roster-data');
  return fs.existsSync(nearCode) ? nearCode : path.join(process.cwd(), 'roster-data');
}

/** Проверка при старте: без данных раздел откроется, но покажет «Нет данных». */
export function checkRosterData(): void {
  const dir = rosterDataDir();
  const missing = ['index.json', 'battlefield.json', 'missions.json', 'aos/index.json'].filter((f) => !fs.existsSync(path.join(dir, f)));
  if (missing.length) console.warn(`[roster] Нет данных Roster Builder в ${dir}: ${missing.join(', ')}. Скопируйте backend/roster-data на сервер или задайте ROSTER_DATA_DIR.`);
}

const gzCache = new Map<string, { mtime: number; body: Uint8Array }>();

/**
 * Файл данных (сжатый gzip, с кешем в памяти).
 * Warhammer 40K: name — 'index', 'battlefield', 'missions' или код фракции (папка roster-data).
 * Age of Sigmar: name — 'index' или код фракции (папка roster-data/aos).
 */
export function readRosterData(name: string, system: '40k' | 'aos' = '40k'): { body: Uint8Array; gzip: boolean } | null {
  if (system === '40k' && !/^(index|battlefield|missions|[A-Za-z]{1,6})$/.test(name)) return null;
  if (system === 'aos' && !/^(index|[A-Za-z]{1,6})$/.test(name)) return null;
  const dir = system === 'aos' ? path.join(rosterDataDir(), 'aos') : rosterDataDir();
  const file = name === 'index' || (system === '40k' && (name === 'battlefield' || name === 'missions')) ? path.join(dir, `${name}.json`) : path.join(dir, 'f', `${name}.json`);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    return null;
  }
  const cached = gzCache.get(file);
  if (cached && cached.mtime === stat.mtimeMs) return { body: cached.body, gzip: true };
  const body = Bun.gzipSync(fs.readFileSync(file));
  gzCache.set(file, { mtime: stat.mtimeMs, body });
  return { body, gzip: true };
}

const aosFactionsCache: { mtime: number; names: string[] } = { mtime: -1, names: [] };

/**
 * Фракции Age of Sigmar для формы записи — из данных Roster Builder (aos/index.json), без «только Legends».
 * Нет файла — пустой список (в форме остаётся «Другая…»).
 */
export function aosFactionNames(): string[] {
  const file = path.join(rosterDataDir(), 'aos', 'index.json');
  try {
    const mtime = fs.statSync(file).mtimeMs;
    if (mtime !== aosFactionsCache.mtime) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { factions?: { name: string; legendsOnly?: boolean }[] };
      aosFactionsCache.names = (data.factions ?? []).filter((f) => !f.legendsOnly).map((f) => f.name).sort((a, b) => a.localeCompare(b));
      aosFactionsCache.mtime = mtime;
    }
    return aosFactionsCache.names;
  } catch {
    return [];
  }
}
