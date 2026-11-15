import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (name: string) => readFileSync(new URL(`../../../client/src/features/roster/ui/common/${name}`, import.meta.url), 'utf8');
const expectTokens = (text: string, tokens: string[]) => {
  for (const token of tokens) assert.ok(text.includes(token), `Отсутствует UI-контракт: ${token}`);
};

test('GameShell сохраняет wide layout 40K, master и совместимые варианты отмены', () => {
  const text = source('GameShell.tsx');
  expectTokens(text, [
    "'tg-safe-top mx-auto min-h-dvh max-w-lg px-4 pt-5'",
    '<FullscreenButton className="mb-0.5" />',
    'kicker: string',
    'title: string',
    'onMaster?: () => void',
    'aria-pressed={master}',
    "'mb-0.5 rounded-full border px-3 py-1.5 text-xs font-semibold'",
    'undoClassName',
    "'mb-0.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-fg-2 active:bg-white/10'",
  ]);
});

test('GameErrorBar сохраняет нижнюю панель, safe area и закрытие', () => {
  const text = source('GameErrorBar.tsx');
  expectTokens(text, ['sheet-enter', 'fixed inset-x-0 bottom-0 z-40', 'border-danger/40', 'bg-app-elevated', 'safe-area-inset-bottom', '{error}', 'label="Закрыть"']);
});

test('SetupStep сохраняет состояния готово и не готово в оформлении AoS', () => {
  const text = source('SetupStep.tsx');
  expectTokens(text, [
    "'rounded-2xl border bg-white/[0.03] p-4'",
    "done ? 'border-white/10' : 'border-accent/30'",
    "done ? 'bg-accent text-black' : 'bg-white/10 text-fg-2'",
    '<Icon name="check" className="size-3.5" />',
    'font-display text-lg font-semibold uppercase',
  ]);
});

test('ScoreboardGrid сохраняет две колонки и системный className', () => {
  const text = source('ScoreboardGrid.tsx');
  expectTokens(text, ['className?: string', "'grid grid-cols-2 gap-2'", 'className)}>{children}</div>']);
});

test('RoundDots использует явные Tailwind-колонки 4/5/6 без динамического класса', () => {
  const text = source('RoundDots.tsx');
  expectTokens(text, ["4: 'grid-cols-4'", "5: 'grid-cols-5'", "6: 'grid-cols-6'", 'COLUMNS[rounds]', "'h-1.5 rounded-full'"]);
  assert.ok(!text.includes('grid-cols-${'), 'Tailwind не должен собирать имя класса на лету');
});

test('SavedGamesFrame сохраняет Telegram Back, пустое состояние и системную подпись', () => {
  const text = source('SavedGamesFrame.tsx');
  expectTokens(text, ['useEffect(() => pushOverlay(onClose), [onClose])', 'Сохранённые игры', 'Сохранённых игр пока нет.', '{count}', '{note}', '{children}']);
});

test('Общие компоненты подключены к эталонным экранам без вторых локальных Shell/Step', () => {
  const read = (path: string) => readFileSync(new URL(`../../../client/src/features/roster/ui/${path}`, import.meta.url), 'utf8');
  expectTokens(read('game/GameScreen.tsx'), ["import { GameShell }", "import { GameErrorBar }", '<GameShell', '<GameErrorBar']);
  expectTokens(read('aosgame/AosGameScreen.tsx'), ["import { GameShell }", "import { GameErrorBar }", "import { SavedGamesFrame }", '<GameShell', '<GameErrorBar', '<SavedGamesFrame']);
  expectTokens(read('aosgame/AosSetup.tsx'), ["import { SetupStep as Step }"]);
  expectTokens(read('skirmish/SkirmishLayout.tsx'), ["export { SetupStep as SkirmishStep } from '../common/SetupStep'"]);
  for (const path of ['game/GameScreen.tsx', 'aosgame/AosGameScreen.tsx', 'aosgame/AosSetup.tsx']) {
    assert.ok(!read(path).includes('function Shell('), `${path}: локальный Shell вернулся`);
    assert.ok(!read(path).includes('function Step('), `${path}: локальный Step вернулся`);
  }
});
