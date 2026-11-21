// Обновить разобранный состав (structure) в данных команд Kill Team без повторного импорта ktdash.
// То же делает import-ktdash.mjs; этот скрипт — когда меняется только tools/roster-data/kt/composition.json.
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const COMPOSITION = JSON.parse(fs.readFileSync(path.join(here, '..', 'kt', 'composition.json'), 'utf8')).teams;
const dir = path.join(here, '..', '..', '..', 'backend', 'roster-data', 'kt', 't');
let n = 0;
for (const f of fs.readdirSync(dir)) {
  const file = path.join(dir, f);
  const t = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete t.structure;
  t.structure = COMPOSITION[t.id] ?? null;
  fs.writeFileSync(file, JSON.stringify(t) + '\n');
  n += t.structure ? 1 : 0;
}
console.log(`Kill Team: состав по слотам у ${n} команд`);
