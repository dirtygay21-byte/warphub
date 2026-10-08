import fs from 'node:fs';
import path from 'node:path';

// ---------- данные Wahapedia для Roster Builder ----------

/**
 * Папка с index.json, battlefield.json и f/<фракция>.json (генерирует tools/roster-data).
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
  const missing = ['index.json', 'battlefield.json', 'aos/index.json'].filter((f) => !fs.existsSync(path.join(dir, f)));
  if (missing.length) console.warn(`[roster] Нет данных Roster Builder в ${dir}: ${missing.join(', ')}. Скопируйте backend/roster-data на сервер или задайте ROSTER_DATA_DIR.`);
}

const gzCache = new Map<string, { mtime: number; body: Uint8Array }>();

/**
 * Файл данных (сжатый gzip, с кешем в памяти).
 * Warhammer 40K: name — 'index', 'battlefield' или код фракции (папка roster-data).
 * Age of Sigmar: name — 'index' или код фракции (папка roster-data/aos).
 */
export function readRosterData(name: string, system: '40k' | 'aos' = '40k'): { body: Uint8Array; gzip: boolean } | null {
  if (system === '40k' && !/^(index|battlefield|[A-Za-z]{1,6})$/.test(name)) return null;
  if (system === 'aos' && !/^(index|[A-Za-z]{1,6})$/.test(name)) return null;
  const dir = system === 'aos' ? path.join(rosterDataDir(), 'aos') : rosterDataDir();
  const file = name === 'index' || name === 'battlefield' ? path.join(dir, `${name}.json`) : path.join(dir, 'f', `${name}.json`);
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
