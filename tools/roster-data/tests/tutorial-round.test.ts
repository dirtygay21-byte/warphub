/**
 * «Учебный раунд» (07.11.2026): прохождение раунда по шагам — структура, пометка «Пример», источник, маршрут.
 */
import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { TUTORIAL_WALKS } from '../../../client/src/components/tutorial/walkthrough';

const ROOT = path.join(import.meta.dirname, '..', '..', '..', 'client', 'src');

describe('учебный раунд', () => {
  test('Warcry: battleplan, инициатива и wild dice, боевая фаза, конец раунда', () => {
    const wc = TUTORIAL_WALKS.warcry!;
    expect(wc.steps.length).toBeGreaterThanOrEqual(10);
    expect(wc.steps.some((s) => s.phase === 1) && wc.steps.some((s) => s.phase === 2)).toBe(true);
    for (const s of wc.steps) if (s.example) expect(s.example.title.startsWith('Пример')).toBe(true);
    expect(wc.source).toContain('warcrier');
    const list = fs.readFileSync(path.join(ROOT, 'features', 'roster', 'ui', 'warcry', 'WarcryList.tsx'), 'utf8');
    expect(list).toContain("navigate('/learn/warcry/round')");
  });
  test('AoS: подготовка, фазы хода, атака, конец хода и следующий раунд', () => {
    const aos = TUTORIAL_WALKS.aos!;
    expect(aos.steps.length).toBeGreaterThanOrEqual(10);
    for (const ph of [2, 3, 4, 5, 6, 7]) expect(aos.steps.some((s) => s.phase === ph)).toBe(true);
    for (const s of aos.steps) if (s.example) expect(s.example.title.startsWith('Пример')).toBe(true);
    expect(aos.sample.lines.filter((l) => /\d/.test(l) && !l.includes('Пример')).length).toBe(0);
    expect(aos.repeat.join(' ')).toContain('11 ПО');
    expect(aos.source).toContain('Core Rules');
    const list = fs.readFileSync(path.join(ROOT, 'features', 'roster', 'ui', 'aos', 'AosList.tsx'), 'utf8');
    expect(list).toContain("navigate('/learn/aos/round')");
  });
  test('40K: подготовка по колоде миссий, 5 фаз, атака, конец хода и следующий раунд', () => {
    const w = TUTORIAL_WALKS['40k']!;
    expect(w.steps.length).toBeGreaterThanOrEqual(10);
    for (const ph of [1, 2, 3, 4, 5]) expect(w.steps.some((s) => s.phase === ph)).toBe(true);
    for (const s of w.steps) if (s.example) expect(s.example.title.startsWith('Пример')).toBe(true);
    expect(w.sample.lines.filter((l) => /\d/.test(l) && !l.includes('Пример')).length).toBe(0);
    // числа правил — из данных приложения: лимиты ПО (missions.json → caps), CP и карты за фазу командования (движок)
    const caps = JSON.parse(fs.readFileSync(path.join(ROOT, '..', '..', 'backend', 'roster-data', 'missions.json'), 'utf8')).caps;
    const repeat = w.repeat.join(' ');
    expect(repeat).toContain(`до ${caps.primaryRound} за раунд и до ${caps.primaryGame} за битву`);
    expect(w.source).toContain('11-я редакция');
    const list = fs.readFileSync(path.join(ROOT, 'features', 'roster', 'ui', 'RosterList.tsx'), 'utf8');
    expect(list).toContain("navigate('/learn/40k/round')");
  });
  test('Kill Team: подготовка, обе фазы, конец turning point и следующий раунд', () => {
    const kt = TUTORIAL_WALKS.kt!;
    expect(kt.steps.length).toBeGreaterThanOrEqual(10);
    expect(kt.steps.some((s) => s.phase === 1)).toBe(true);
    expect(kt.steps.some((s) => s.phase === 2)).toBe(true);
    for (const s of kt.steps) expect(s.doIt.length).toBeGreaterThan(0);
    expect(kt.repeat.length).toBeGreaterThan(0);
    expect(kt.source).toContain('Lite Rules');
    // учебные числа помечены: примеры называются «Пример…»
    for (const s of kt.steps) if (s.example) expect(s.example.title.startsWith('Пример')).toBe(true);
    expect(kt.sample.lines.filter((l) => /\d/.test(l) && !l.includes('Пример')).length).toBe(0);
  });
  test('маршрут /learn/:game/round и ссылки с хаба и последней карточки', () => {
    const app = fs.readFileSync(path.join(ROOT, 'App.tsx'), 'utf8');
    expect(app).toContain('<Route path=":game/round" element={<TutorialRound />} />');
    const pages = fs.readFileSync(path.join(ROOT, 'components', 'tutorial', 'TutorialPages.tsx'), 'utf8');
    expect(pages).toContain('navigate(`/learn/${game.id}/round`)');
    expect(pages).toContain('Повторить раунд');
    const ktList = fs.readFileSync(path.join(ROOT, 'features', 'roster', 'ui', 'kt', 'KtList.tsx'), 'utf8');
    expect(ktList).toContain("title: 'Обучающая игра'");
    expect(ktList).toContain("navigate('/learn/kt/round')");
  });
  test('обучающая игра — только после карточек «Как играть» (13.11.2026)', () => {
    const pages = fs.readFileSync(path.join(ROOT, 'components', 'tutorial', 'TutorialPages.tsx'), 'utf8');
    // последняя карточка отмечает прохождение; раунд без него ведёт на карточки; на хабе раунд — только у пройденных
    expect(pages).toContain('markLearnDone(game.id)');
    expect(pages).toContain('if (!learnDone(game.id)) return <Navigate to={`/learn/${game.id}`} replace />;');
    expect(pages).not.toContain('<SectionLabel>Обучающая игра</SectionLabel>');
    for (const [f, g] of [['RosterList.tsx', '40k'], ['aos/AosList.tsx', 'aos'], ['kt/KtList.tsx', 'kt'], ['warcry/WarcryList.tsx', 'warcry']] as const) {
      const list = fs.readFileSync(path.join(ROOT, 'features', 'roster', 'ui', f), 'utf8');
      // 40K: подпись на языке экрана — t('Обучающая игра', …) (переключатель RU/EN, 16.11.2026)
      expect(list).toMatch(new RegExp(`\\.\\.\\.\\(learnDone\\('${g}'\\) \\? \\[\\{ icon: 'shield', title: (t\\()?'Обучающая игра'`));
    }
  });
});
