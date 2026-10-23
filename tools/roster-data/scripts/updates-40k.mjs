/**
 * Проверенные обновления данных 40K поверх выгрузки Wahapedia (40k/curated.json → updates).
 *
 * Одна функция repair40kData — и для импорта (scripts/import-wahapedia.mjs вызывает её после записи данных),
 * и для готовых файлов без CSV (scripts/repair-40k-data.mjs). Поэтому переимпорт не стирает обновления,
 * а повторный запуск ничего не меняет.
 *
 * curated.updates.items — список обновлений { id, kind, snapshot, enabled, scope, note }:
 *   kind     — что делает обновление; обработчик передаётся в appliers (whrules-faction — scripts/whrules-convert.mjs,
 *              WHRULES_APPLIERS; импорт и repair-40k-data подключают его сами);
 *   snapshot — файл снимка источника в tools/roster-data/40k/ (например whrules-981.json), проверяется fingerprint
 *              (схема — по обработчику: apply.load, иначе снимок очков);
 *   enabled  — false: обновление описано, но не применяется;
 *   scope    — какие данные обновляются (для метаданных версии), note — что осталось на старой версии.
 * Применённые обновления записываются в index.json → updates: [{ id, kind, scope, note, source }], чтобы было видно,
 * какие данные на какой версии источника. Без применённых обновлений index.json не меняется.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SNAPSHOT_DIR = path.join(HERE, '..', '40k');
export const WHRULES_SCHEMA = 'whrules-points-snapshot/1';
/** /2 — все фракции сайта, у каждой ещё name, detachments (улучшения с очками) и renames; поля /1 те же. */
export const WHRULES_SCHEMA_V2 = 'whrules-points-snapshot/2';
const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

/** Обработчики обновлений по kind: (files, snapshot, update) => { changed: число изменённых значений, lines: [] }. */
export const APPLIERS = {};

/** Проверка снимка wh-rules: схема, обязательные поля, fingerprint. Ошибка — исключение. */
export function checkWhrulesSnapshot(snap) {
  if (snap?.schema !== WHRULES_SCHEMA && snap?.schema !== WHRULES_SCHEMA_V2) throw new Error(`снимок: схема ${snap?.schema}, ожидается ${WHRULES_SCHEMA} или ${WHRULES_SCHEMA_V2}`);
  const s = snap.source ?? {};
  for (const k of ['site', 'dataVersion', 'mfm', 'date', 'extractedAt']) if (s[k] == null || s[k] === '') throw new Error(`снимок: нет source.${k}`);
  if (!snap.assets || !Object.values(snap.assets).every((h) => /^[0-9a-f]{64}$/.test(h))) throw new Error('снимок: нет SHA-256 модулей источника');
  if (!snap.factions || !Object.values(snap.factions).every((f) => Array.isArray(f.datasheets))) throw new Error('снимок: нет инфолистов');
  if (!Array.isArray(snap.patches)) throw new Error('снимок: нет истории обновлений');
  if (snap.schema === WHRULES_SCHEMA_V2)
    for (const [slug, f] of Object.entries(snap.factions)) {
      if (!f.name || !Array.isArray(f.detachments) || !f.renames || typeof f.renames !== 'object') throw new Error(`снимок: у ${slug} нет name, detachments или renames`);
      if (f.detachments.some((d) => !d.id || !d.name || !Array.isArray(d.enhancements))) throw new Error(`снимок: детачмент ${slug} без id, имени или улучшений`);
    }
  const { fingerprint, ...content } = snap;
  if (sha256(JSON.stringify(content)) !== fingerprint) throw new Error('снимок: fingerprint не совпадает — файл изменён после снятия');
  return snap;
}

export function loadSnapshot(file, dir = SNAPSHOT_DIR) {
  return checkWhrulesSnapshot(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
}

/**
 * Применяет включённые обновления к данным в памяти. files — { "<id>.json": данные фракции }, index — index.json.
 * Возвращает { changed, lines }. Порядок применения — порядок в curated; метаданные пишутся заново (не дописываются).
 */
export function apply40kUpdates(files, index, curated, { appliers = APPLIERS, snapshotDir = SNAPSHOT_DIR } = {}) {
  const items = (curated.updates?.items ?? []).filter((u) => u.enabled !== false);
  const ids = new Set();
  const applied = [];
  const lines = [];
  let changed = 0;
  for (const u of items) {
    if (!u.id || ids.has(u.id)) throw new Error(`curated.updates: пустой или повторный id «${u.id}»`);
    ids.add(u.id);
    const apply = appliers[u.kind];
    if (!apply) throw new Error(`curated.updates «${u.id}»: нет обработчика для kind «${u.kind}»`);
    // обработчик может читать снимок своей схемы (apply.load, например полный снимок wh-rules); иначе — снимок очков
    const snap = apply.load ? apply.load(u.snapshot, snapshotDir) : loadSnapshot(u.snapshot, snapshotDir);
    const res = apply(files, snap, u);
    changed += res.changed;
    lines.push(...res.lines.map((l) => `${u.id}: ${l}`));
    applied.push({
      id: u.id,
      kind: u.kind,
      scope: u.scope ?? null,
      note: u.note ?? null,
      source: { site: snap.source.site, dataVersion: snap.source.dataVersion, mfm: snap.source.mfm, date: snap.source.date, snapshot: u.snapshot, fingerprint: snap.fingerprint },
    });
  }
  if (applied.length) index.updates = applied;
  else delete index.updates;
  return { changed, lines, applied };
}

/**
 * Готовые данные 40K в каталоге dir (index.json + f/*.json): применить обновления и записать изменившиеся файлы
 * в том же формате, что и импорт. check — ничего не записывать. Возвращает { changedFiles, lines }.
 */
export function repair40kData(dir, curated, { check = false, appliers, snapshotDir } = {}) {
  const fdir = path.join(dir, 'f');
  const names = fs.readdirSync(fdir).filter((f) => f.endsWith('.json')).sort();
  const before = Object.fromEntries(names.map((f) => [f, fs.readFileSync(path.join(fdir, f), 'utf8')]));
  const files = Object.fromEntries(names.map((f) => [f, JSON.parse(before[f])]));
  const indexPath = path.join(dir, 'index.json');
  const indexBefore = fs.readFileSync(indexPath, 'utf8');
  const index = JSON.parse(indexBefore);
  const res = apply40kUpdates(files, index, curated, { appliers, snapshotDir });
  const changedFiles = [];
  for (const f of names) {
    const after = JSON.stringify(files[f]);
    if (after === before[f]) continue;
    changedFiles.push(`f/${f}`);
    if (!check) fs.writeFileSync(path.join(fdir, f), after);
  }
  const indexAfter = JSON.stringify(index, null, 1);
  if (indexAfter !== indexBefore) {
    changedFiles.push('index.json');
    if (!check) fs.writeFileSync(indexPath, indexAfter);
  }
  const lines = [...res.lines];
  lines.push(res.applied.length ? `обновления 40K: ${res.applied.map((a) => `${a.id} (${a.source.site}, данные ${a.source.dataVersion}, MFM ${a.source.mfm}, ${a.source.date})`).join('; ')}` : 'обновления 40K (40k/curated.json → updates): не включены');
  return { changedFiles, lines };
}
