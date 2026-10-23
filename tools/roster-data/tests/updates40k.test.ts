// Обновления 40K поверх выгрузки (40k/curated.json → updates) и снимок wh-rules.ru (40k/whrules-981.json). Запуск: bun test tests/
// 1) снимок: схема, fingerprint, версия источника, состав;
// 2) механизм: без включённых обновлений данные не меняются; применение идемпотентно, пишет метаданные версии,
//    не трогает чужие файлы; ошибки схемы останавливают обработку; импорт вызывает ту же функцию.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-expect-error — .mjs без типов
import { apply40kUpdates, checkWhrulesSnapshot, loadSnapshot, repair40kData } from '../scripts/updates-40k.mjs';
// @ts-expect-error — модуль .mjs без типов
import { WHRULES_APPLIERS } from '../scripts/whrules-points.mjs';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');
const DATA = path.join(ROOT, 'backend', 'roster-data');
const SCRIPTS = path.join(import.meta.dirname, '..', 'scripts');
const curated = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', '40k', 'curated.json'), 'utf8'));
const CHAPTERS = ['space-marines', 'black-templars', 'blood-angels', 'dark-angels', 'deathwatch', 'space-wolves'];

// ---------- снимок wh-rules ----------

test('снимок wh-rules 981: схема и fingerprint сходятся, версия источника записана', () => {
  const s = loadSnapshot('whrules-981.json');
  assert.equal(s.source.site, 'https://wh-rules.ru');
  assert.equal(s.source.dataVersion, 981);
  assert.equal(s.source.mfm, '1.6');
  assert.equal(s.source.date, '2026-10-14');
  assert.equal(s.fingerprint, 'bfefb473c041fc9c0a08aeb2982fa58ac77c8b4687f6dd8f68c20b518a297f33');
  assert.ok(Object.keys(s.assets).length >= 10);
  // любое изменение содержимого ловится fingerprint
  const broken = JSON.parse(JSON.stringify(s));
  broken.factions['space-marines'].datasheets[0].points[0].points += 5;
  assert.throws(() => checkWhrulesSnapshot(broken), /fingerprint/);
});

test('снимок wh-rules 981: 222 инфолиста Space Marines и орденов, Imperial Agents, история MFM 1.1–1.6', () => {
  const s = loadSnapshot('whrules-981.json');
  assert.equal(CHAPTERS.reduce((n, f) => n + s.factions[f].datasheets.length, 0), 222);
  assert.equal(s.factions['imperial-agents'].datasheets.length, 46);
  for (const f of CHAPTERS.slice(1)) assert.ok(s.factions[f].sharedUnitIds.length > 80, f);
  for (const f of ['black-templars', 'blood-angels', 'dark-angels', 'space-wolves'])
    assert.deepEqual(s.factions[f].pointsOverrides, { 'centurion-devastator-squad': [{ models: 3, points: 175 }, { models: 6, points: 350 }] }, f);
  assert.deepEqual(s.factions.deathwatch.pointsOverrides, {});
  const mfm = s.patches.filter((p: { labels: { mfm?: string } }) => p.labels.mfm).map((p: { labels: { mfm: string }; date: string }) => `${p.labels.mfm} ${p.date}`);
  assert.deepEqual(mfm, ['1.1 2026-07-29', '1.2 2026-08-15', '1.3 2026-08-26', '1.4 2026-09-02', '1.5 2026-09-30', '1.5 2026-10-02', '1.6 2026-10-14']);
});

// ---------- механизм на копии данных ----------

function copyData() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'w40k-upd-'));
  fs.mkdirSync(path.join(dir, 'f'));
  fs.copyFileSync(path.join(DATA, 'index.json'), path.join(dir, 'index.json'));
  for (const f of fs.readdirSync(path.join(DATA, 'f'))) fs.copyFileSync(path.join(DATA, 'f', f), path.join(dir, 'f', f));
  return dir;
}
const snapshotOf = (dir: string) => Object.fromEntries(['index.json', ...fs.readdirSync(path.join(dir, 'f')).map((f) => `f/${f}`)].map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));

test('включённые обновления whrules-981 и whrules-995-points уже применены: repair ничего не меняет (текущие curated и данные)', () => {
  const dir = copyData();
  try {
    const before = snapshotOf(dir);
    const res = repair40kData(dir, curated, { appliers: WHRULES_APPLIERS });
    assert.deepEqual(res.changedFiles, []);
    assert.deepEqual(snapshotOf(dir), before);
    assert.deepEqual(JSON.parse(before['index.json']).updates.map((u: { id: string }) => u.id), ['whrules-981-space-marines', 'whrules-995-points']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('обновление применяется один раз: метаданные версии в index.json, повторный запуск ничего не меняет, чужие файлы не тронуты', () => {
  const dir = copyData();
  try {
    const before = snapshotOf(dir);
    // тестовый обработчик: меняет одно значение в SM.json (настоящие обработчики появятся в задачах 5B+)
    const appliers = {
      test: (files: Record<string, { datasheets: { id: string; name: string }[] }>) => {
        const d = files['SM.json'].datasheets[0];
        const was = d.name;
        d.name = 'TEST NAME';
        return { changed: was === 'TEST NAME' ? 0 : 1, lines: ['1 значение'] };
      },
    };
    const cur = { updates: { items: [{ id: 'whrules-981-test', kind: 'test', snapshot: 'whrules-981.json', scope: 'test scope', note: 'test note' }] } };
    const r1 = repair40kData(dir, cur, { appliers });
    assert.deepEqual(r1.changedFiles.sort(), ['f/SM.json', 'index.json']);
    const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
    assert.deepEqual(index.updates, [
      {
        id: 'whrules-981-test',
        kind: 'test',
        scope: 'test scope',
        note: 'test note',
        source: { site: 'https://wh-rules.ru', dataVersion: 981, mfm: '1.6', date: '2026-10-14', snapshot: 'whrules-981.json', fingerprint: 'bfefb473c041fc9c0a08aeb2982fa58ac77c8b4687f6dd8f68c20b518a297f33' },
      },
    ]);
    const after = snapshotOf(dir);
    for (const f of Object.keys(before)) if (f !== 'f/SM.json' && f !== 'index.json') assert.equal(after[f], before[f], `${f} не должен меняться`);
    // повторный запуск — без изменений, метаданные не дублируются
    const r2 = repair40kData(dir, cur, { appliers });
    assert.deepEqual(r2.changedFiles, []);
    assert.deepEqual(snapshotOf(dir), after);
    // выключенное обновление: данные обработчика остаются как есть, но метаданные снимаются — index совпадает с исходным
    repair40kData(dir, { updates: { items: [{ ...cur.updates.items[0], enabled: false }] } }, { appliers });
    const { updates: _u, ...indexBefore } = JSON.parse(before['index.json']);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')), indexBefore);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('ошибки: неизвестный kind, повторный id, повреждённый снимок — обработка останавливается', () => {
  const files = {};
  const index = {};
  assert.throws(() => apply40kUpdates(files, index, { updates: { items: [{ id: 'a', kind: 'nope', snapshot: 'whrules-981.json' }] } }), /нет обработчика/);
  const appliers = { t: () => ({ changed: 0, lines: [] }) };
  assert.throws(
    () => apply40kUpdates(files, index, { updates: { items: [{ id: 'a', kind: 't', snapshot: 'whrules-981.json' }, { id: 'a', kind: 't', snapshot: 'whrules-981.json' }] } }, { appliers }),
    /повторный id/,
  );
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'w40k-snap-'));
  try {
    const s = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', '40k', 'whrules-981.json'), 'utf8'));
    s.source.mfm = '1.5';
    fs.writeFileSync(path.join(dir, 'bad.json'), JSON.stringify(s));
    assert.throws(() => apply40kUpdates(files, index, { updates: { items: [{ id: 'a', kind: 't', snapshot: 'bad.json' }] } }, { appliers, snapshotDir: dir }), /fingerprint/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('импорт и repair применяют обновления одной функцией (переимпорт не стирает обновления)', () => {
  const imp = fs.readFileSync(path.join(SCRIPTS, 'import-wahapedia.mjs'), 'utf8');
  assert.match(imp, /import \{ repair40kData \} from '\.\/updates-40k\.mjs'/);
  assert.match(imp, /repair40kData\(OUT, curated, \{ appliers: WHRULES_APPLIERS \}\)/);
  assert.match(fs.readFileSync(path.join(SCRIPTS, 'repair-40k-data.mjs'), 'utf8'), /repair40kData\(DIR, curated/);
});
