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

let cache;
/** { files: { "<id>.json": данные }, index } или null. */
export function baseline40k() {
  if (cache !== undefined) return cache;
  try {
    const names = git(['ls-tree', '--name-only', `${BASELINE.rev}:${BASELINE.dir}/f`]).split('\n').filter((f) => f.endsWith('.json')).sort();
    const files = Object.fromEntries(names.map((f) => [f, JSON.parse(git(['show', `${BASELINE.rev}:${BASELINE.dir}/f/${f}`]))]));
    const index = JSON.parse(git(['show', `${BASELINE.rev}:${BASELINE.dir}/index.json`]));
    cache = names.length ? { files, index } : null;
  } catch {
    cache = null;
  }
  return cache;
}
