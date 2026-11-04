import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path: string) => readFileSync(new URL(`../../../client/src/features/roster/${path}`, import.meta.url), 'utf8');
const expectTokens = (text: string, tokens: string[]) => {
  for (const token of tokens) assert.ok(text.includes(token), `Отсутствует контракт Warcry: ${token}`);
};

test('редактор Warcry имеет view/edit и read-only бойцов', () => {
  const text = source('ui/warcry/WarcryEditor.tsx');
  expectTokens(text, ['const [view, setView] = useState(false)', 'readOnly={view}', "view ? 'Редактировать' : 'Режим просмотра'", 'scrollToFighter', 'onOpenIssue={(issue) =>', '{!readOnly && (']);
});

test('группы не редактируются в просмотре', () => {
  const text = source('ui/warcry/WarcryEditor.tsx');
  expectTokens(text, ['disabled={view}', 'readOnly={view}', 'disabled={readOnly}', 'disabled:cursor-default disabled:opacity-70']);
});

test('нижняя панель, дублирование и retry присутствуют', () => {
  const text = source('ui/warcry/WarcryEditor.tsx');
  expectTokens(text, ['fixed inset-x-0 bottom-0 z-30', 'safe-area-inset-bottom', 'Добавить бойца', 'onDuplicate({ ...roster, id: uid()', 'Дублировать варбанду', 'setAttempt((n) => n + 1)', 'Повторить']);
  const app = source('ui/App.tsx');
  expectTokens(app, ['onDuplicate={(r) => {', "setRoute({ screen: 'wc-editor', id: r.id })"]);
});

test('импорт Warcry различает коды остальных систем', () => {
  const text = source('ui/warcry/WarcryList.tsx');
  expectTokens(text, ["c.startsWith('WH1.')", "c.startsWith('AOS1.')", "c.startsWith('KT1.')", 'haptic.ok()', 'haptic.error()', 'После импорта варбанда проверяется по правилам']);
});
