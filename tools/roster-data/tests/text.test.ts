// Тексты правил: служебная разметка Wahapedia не должна доходить до экрана. Запуск: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cleanRuleText, hasMarkup, rawIncomplete as clientIncomplete } from '../../../client/src/features/roster/text';
import { cleanWahaText, htmlToText, rawIncomplete } from '../scripts/import-wahapedia.mjs';
import { findMarkup, normaliseAosFaction } from '../scripts/import-wahapedia-aos.mjs';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');
const AOS = path.join(ROOT, 'backend', 'roster-data', 'aos');
const W40K = path.join(ROOT, 'backend', 'roster-data');
const curated = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'aos', 'curated.json'), 'utf8'));
const files = (dir: string) => fs.readdirSync(path.join(dir, 'f')).filter((f) => f.endsWith('.json'));

const CASES: [string, string][] = [
  // ссылка Wahapedia в поле timing (реакция Gloomspite Gitz со скриншота)
  ['Reaction: You declared the ‘%000015359The Faces of the Bad Moon%’ ability', 'Reaction: You declared the ‘The Faces of the Bad Moon’ ability'],
  ['Reaction: You declared the ‘%000009837Redeploy%’ command for a friendly %000000543MOONCLAN% unit', 'Reaction: You declared the ‘Redeploy’ command for a friendly MOONCLAN unit'],
  ['a %000010870FIGHT ability% for this unit', 'a FIGHT ability for this unit'],
  ['orphan %000010870 link', 'orphan link'],
  // теги ключевых слов, в том числе закодированные
  ['a friendly <KY>THE BLACKTALONS</KY> unit', 'a friendly THE BLACKTALONS unit'],
  ['a &lt;KY&gt;THE BLACKTALONS&lt;/KY&gt; unit', 'a THE BLACKTALONS unit'],
  ['&amp;lt;KY&amp;gt;X&amp;lt;/KY&amp;gt; y', 'X y'],
  // дважды закодированные пробелы (детачмент 40K)
  ['BATTLE ROUND2\n\n&amp;emsp;&amp;emsp; ONWARDS', 'BATTLE ROUND2\n\nONWARDS'],
  ['BATTLE ROUND2\n\n&emsp;&emsp; ONWARDS', 'BATTLE ROUND2\n\nONWARDS'],
  // обычный текст не портится
  ['Roll a D6. On a 3+, if x < 3 and y > 2', 'Roll a D6. On a 3+, if x < 3 and y > 2'],
  ['Effect: 50% of models', 'Effect: 50% of models'],
  ['Line one<br>Line two', 'Line one\nLine two'],
  ['• [LETHAL HITS]\n• [SUSTAINED HITS 1]', '• [LETHAL HITS]\n• [SUSTAINED HITS 1]'],
  ['', ''],
  // текст, обрезанный лимитом выгрузки посреди ссылки (Surge of Hatred): обрывок тега не показывается
  ['add D3 to the roll. <a href="/aos4/the-rules/the-c', 'add D3 to the roll.'],
  // заглушка невыгруженной таблицы (Skaven, Prized Creations)
  ['Pick 1 of the following:\n$000001417', 'Pick 1 of the following:'],
];

test('текст: очистка в клиенте и в импортёре даёт одинаковый результат', () => {
  for (const [input, want] of CASES) {
    assert.equal(cleanRuleText(input), want, `client: ${JSON.stringify(input)}`);
    assert.equal(cleanWahaText(input), want, `importer: ${JSON.stringify(input)}`);
    assert.equal(hasMarkup(want), false, `после очистки нет разметки: ${JSON.stringify(want)}`);
  }
  assert.equal(cleanRuleText(null), '');
  assert.equal(cleanRuleText(undefined), '');
  // hasMarkup без состояния между вызовами (глобальный RegExp с lastIndex)
  for (let i = 0; i < 3; i++) assert.equal(hasMarkup('a <KY>B</KY>'), true);
});

test('неполные тексты: обрыв по лимиту 1024 символа и невыгруженная таблица распознаются одинаково', () => {
  // лимит поля description в выгрузке AoS — 1024 символа; Wahapedia иногда срезает хвостовой пробел (1023)
  assert.equal(rawIncomplete('x'.repeat(1024), 1024), 'truncated');
  assert.equal(rawIncomplete('x'.repeat(1023), 1024), 'truncated');
  assert.equal(rawIncomplete('x'.repeat(1022), 1024), null);
  // без лимита (40K) — только видимые признаки, как в клиенте
  for (const [s, want] of [
    ['x'.repeat(2000), null],
    ['Roll a D6. <a href="/aos4/the-rul', 'truncated'],
    ['Pick 1:\n$000001417', 'table'],
    ['if x < 3 and y > 2', null],
    ['', null],
  ] as const) {
    assert.equal(rawIncomplete(s), want, `importer: ${s.slice(0, 40)}`);
    assert.equal(clientIncomplete(s), want, `client: ${s.slice(0, 40)}`);
  }
});

test('импорт: колонка condition (поле timing) проходит ту же очистку, что и текст', () => {
  // так поле timing попадало в данные до исправления — со ссылками Wahapedia
  assert.equal(htmlToText('Reaction: You declared a %000010870FIGHT ability% for this unit'), 'Reaction: You declared a FIGHT ability for this unit');
  assert.equal(htmlToText('<p>Effect: a &lt;KY&gt;WIZARD&lt;/KY&gt; unit</p>'), 'Effect: a WIZARD unit');
});

test('данные AoS: ни в одном текстовом поле правил нет разметки', () => {
  for (const f of files(AOS)) {
    const data = JSON.parse(fs.readFileSync(path.join(AOS, 'f', f), 'utf8'));
    assert.deepEqual(findMarkup(data), [], f);
    // и повторная обработка ничего не меняет — данные уже в итоговом виде (scripts/repair-aos-data.mjs --check)
    const raw = JSON.stringify(data);
    assert.equal(JSON.stringify(normaliseAosFaction(JSON.parse(raw), curated)), raw, `${f}: нужна обработка repair-aos-data.mjs`);
  }
});

test('данные 40K: нет ссылок Wahapedia, а остатки сущностей убирает очистка при показе', () => {
  let entities = 0;
  const walk = (o: unknown) => {
    if (typeof o === 'string') {
      assert.ok(!/%\d{6,}/.test(o), `ссылка Wahapedia: ${o.slice(0, 80)}`);
      assert.ok(!/<\/?KY>/i.test(o), `тег ключевого слова: ${o.slice(0, 80)}`);
      if (hasMarkup(o)) {
        entities++;
        assert.equal(hasMarkup(cleanRuleText(o)), false, o.slice(0, 80));
      }
    } else if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') Object.values(o).forEach(walk);
  };
  for (const f of files(W40K)) walk(JSON.parse(fs.readFileSync(path.join(W40K, 'f', f), 'utf8')));
  assert.ok(entities < 10, `слишком много разметки в данных 40K (${entities}) — перезапустите импорт`);
});
