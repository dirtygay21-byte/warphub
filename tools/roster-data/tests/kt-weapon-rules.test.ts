import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { ktRuleIndex, ktWeaponRuleTokens, splitKtRules } from '../../../client/src/features/roster/kt/weaponRules';

const DATA = path.join(import.meta.dir, '..', '..', '..', 'backend', 'roster-data', 'kt');
const index = JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'), 'utf8'));
const find = ktRuleIndex(index.weaponRules);

describe('правила оружия Kill Team: нажатие открывает текст', () => {
  test('сокращения и полные названия с значениями', () => {
    const t = ktWeaponRuleTokens('Rng 8", Lethal 5+, Prc1, PrcCrit 1, 2" Dev1, Hvy(Dash), Heavy (Dash only), Tor1", Stun', find);
    expect(t.map((x) => x.rule?.name)).toEqual(['Range 8"', 'Lethal 5+', 'Piercing 1', 'Piercing Crits 1', '2" Devastating 1', 'Heavy (Dash Only)', 'Heavy (Dash Only)', 'Torrent 1"', 'Stun']);
    expect(t[1].rule!.text).toContain('5+');
    expect(t[1].rule!.text).not.toContain('_');
  });
  test('правило со звёздочкой — способность оперативника', () => {
    const own = [{ id: 'x', name: '*Concealed Position', text: 'Only once.', ap: null, factionRule: false }];
    expect(ktWeaponRuleTokens('Dev3, *Concealed Position', find, own)[1].rule).toEqual({ name: 'Concealed Position', text: 'Only once.', sub: 'Способность оперативника' });
  });
  test('запятые в скобках не делят правило', () => {
    expect(splitKtRules('Hvy (Dash, Repos), Sil')).toEqual(['Hvy (Dash, Repos)', 'Sil']);
  });
  test('все правила оружия в данных находятся (кроме известных пробелов источника)', () => {
    const missing = new Map<string, number>();
    let total = 0;
    for (const f of fs.readdirSync(path.join(DATA, 't'))) {
      const team = JSON.parse(fs.readFileSync(path.join(DATA, 't', f), 'utf8'));
      for (const o of team.operatives)
        for (const w of o.weapons)
          for (const p of w.profiles)
            for (const tok of ktWeaponRuleTokens(p.rules, find, o.abilities)) {
              total++;
              if (!tok.rule) missing.set(tok.label, (missing.get(tok.label) ?? 0) + 1);
            }
    }
    const miss = [...missing].sort((a, b) => b[1] - a[1]);
    console.log(`правил оружия: ${total}, без текста: ${miss.reduce((s, [, n]) => s + n, 0)}`, miss.slice(0, 30));
    // пробелы источника: Psychic и Selection нет в справочнике WR KTDash; Twinned/Paired — пояснение текстом;
    // «Blaze *», «Wreathed*», «*Tor 0"», «Minimum Rng8"» — опечатки в данных. Всё остальное должно находиться.
    const known = /^(Selection \d|Psychic$|PSYCHIC$|Twinned:|Paired:|add 1 to|Blaze \*$|Wreathed\*$|Minimum Rng|\*Tor 0")/;
    expect(miss.filter(([l]) => !known.test(l))).toEqual([]);
  });
});
