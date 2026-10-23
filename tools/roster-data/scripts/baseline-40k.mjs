/**
 * Данные 40K до обновления whrules-981-space-marines — вывод импорта Wahapedia, как он был в репозитории
 * (коммит BASELINE.rev). Нужны тестам конвертера: они сравнивают «до» и «после» и проверяют, что данные в
 * backend/roster-data ровно те, что даёт обновление (применённое к этим данным).
 *
 * Читается из истории git (git show <rev>:backend/roster-data/…); без git или без этого коммита — null
 * (тесты, которым нужны данные «до», пропускаются, как тесты сверки с CSV без выгрузки).
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const BASELINE = { rev: '4a91fa0633783898616e142adc0679ba877df255', dir: 'backend/roster-data' };

const git = (args) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

/** Данные до обновления whrules-995-points (P1-T3): коммит f8387fa — отчёт свежести P1-T2 построен по ним. */
export const BEFORE_POINTS = { rev: 'f8387fa012dea556e89da258afc5de6c158a3a91', dir: 'backend/roster-data' };

const cache = new Map();
/** Данные 40K из коммита rev: { files: { "<id>.json": данные }, index } или null (нет git или коммита). */
export function data40kAt(rev, dir = BASELINE.dir) {
  if (cache.has(rev)) return cache.get(rev);
  let res = null;
  try {
    const names = git(['ls-tree', '--name-only', `${rev}:${dir}/f`]).split('\n').filter((f) => f.endsWith('.json')).sort();
    const files = Object.fromEntries(names.map((f) => [f, JSON.parse(git(['show', `${rev}:${dir}/f/${f}`]))]));
    const index = JSON.parse(git(['show', `${rev}:${dir}/index.json`]));
    res = names.length ? { files, index } : null;
  } catch {
    res = null;
  }
  cache.set(rev, res);
  return res;
}
/** { files: { "<id>.json": данные }, index } или null. */
export const baseline40k = () => data40kAt(BASELINE.rev);
