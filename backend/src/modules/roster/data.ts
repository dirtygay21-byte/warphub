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
  const missing = ['index.json', 'battlefield.json', 'missions.json', 'aos/index.json', 'kt/index.json', 'warcry/index.json'].filter((f) => !fs.existsSync(path.join(dir, f)));
  if (missing.length) console.warn(`[roster] Нет данных Roster Builder в ${dir}: ${missing.join(', ')}. Скопируйте backend/roster-data на сервер или задайте ROSTER_DATA_DIR.`);
}

const gzCache = new Map<string, { mtime: number; body: Uint8Array }>();

/**
 * Файл данных (сжатый gzip, с кешем в памяти).
 * Warhammer 40K: name — 'index', 'battlefield', 'missions', 'dominatus', 'glossary' или код фракции (папка roster-data).
 * Age of Sigmar: name — 'index', 'battlepack' или код фракции (папка roster-data/aos).
 */
export function readRosterData(name: string, system: '40k' | 'aos' | 'kt' | 'warcry' = '40k'): { body: Uint8Array; gzip: boolean } | null {
  // Kill Team (W2 30.10.2026): 'index' или id команды из ktdash (AEL-BOK, IMP-TEMPAQ…) — файлы roster-data/kt/t
  if (system === 'kt' && !/^(index|[A-Z]{2,6}-[A-Z0-9]{2,8})$/.test(name)) return null;
  // Warcry (W4 30.10.2026): 'index' или id фракции из warcry_data (blades-of-khorne-bloodbound, chaos…) — файлы roster-data/warcry/f
  if (system === 'warcry' && !/^(index|[a-z][a-z0-9-]{1,59})$/.test(name)) return null;
  if (system === '40k' && !/^(index|battlefield|missions|dominatus|glossary|[A-Za-z]{1,6})$/.test(name)) return null;
  if (system === 'aos' && !/^(index|battlepack|[A-Za-z]{1,6})$/.test(name)) return null;
  const dir = system === '40k' ? rosterDataDir() : path.join(rosterDataDir(), system);
  // AoS: battlepack — данные General's Handbook (батлпланы, тактики) рядом с index.json
  const top = name === 'index' || (system === '40k' && (name === 'battlefield' || name === 'missions' || name === 'dominatus' || name === 'glossary')) || (system === 'aos' && name === 'battlepack');
  const file = top ? path.join(dir, `${name}.json`) : path.join(dir, system === 'kt' ? 't' : 'f', `${name}.json`);
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

const warcryFactionsCache: { mtime: number; names: string[] } = { mtime: -1, names: [] };

/**
 * Фракции Warcry для формы записи (W6 30.10.2026) — из данных WarpBuilder (warcry/index.json), без общих файлов альянсов.
 * Нет файла — пустой список (в форме остаётся «Другая…»).
 */
export function warcryFactionNames(): string[] {
  const file = path.join(rosterDataDir(), 'warcry', 'index.json');
  try {
    const mtime = fs.statSync(file).mtimeMs;
    if (mtime !== warcryFactionsCache.mtime) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { factions?: { name: string; generic?: boolean }[] };
      warcryFactionsCache.names = (data.factions ?? []).filter((f) => !f.generic).map((f) => f.name).sort((a, b) => a.localeCompare(b));
      warcryFactionsCache.mtime = mtime;
    }
    return warcryFactionsCache.names;
  } catch {
    return [];
  }
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
