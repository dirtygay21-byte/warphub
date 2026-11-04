import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path: string) => readFileSync(new URL(`../../../client/src/features/roster/${path}`, import.meta.url), 'utf8');
const expectTokens = (text: string, tokens: string[]) => {
  for (const token of tokens) assert.ok(text.includes(token), `Отсутствует контракт Kill Team: ${token}`);
};

test('редактор Kill Team имеет общий view/edit контракт и read-only датакарты', () => {
  const text = source('ui/kt/KtEditor.tsx');
  expectTokens(text, [
    'const [view, setView] = useState(false)',
    'readOnly={view}',
    "view ? 'Редактировать' : 'Режим просмотра'",
    'onOpenIssue={(issue) =>',
    'scrollToOperative',
    'onToggle={readOnly ? undefined : toggle}',
    '{!readOnly && (',
  ]);
});

test('нижняя панель, дублирование и повторная загрузка присутствуют', () => {
  const text = source('ui/kt/KtEditor.tsx');
  expectTokens(text, [
    'fixed inset-x-0 bottom-0 z-30',
    'safe-area-inset-bottom',
    'Добавить оперативника',
    'onDuplicate({ ...roster, id: uid()',
    'Дублировать команду',
    'setAttempt((n) => n + 1)',
    'Повторить',
  ]);
  const app = source('ui/App.tsx');
  expectTokens(app, ['onDuplicate={(r) => {', "setRoute({ screen: 'kt-editor', id: r.id })"]);
});

test('общий EditorHeader поддерживает read-only и deep-link ошибок', () => {
  const text = source('ui/common/BuilderKit.tsx');
  expectTokens(text, ['readOnly = false', 'onOpenIssue?: (issue: BuilderIssue) => void', 'readOnly ? <p', 'onClick={() => (setOpen(false), onOpenIssue?.(i))}', 'uids?: string[]']);
});

test('импорт Kill Team различает коды остальных систем', () => {
  const text = source('ui/kt/KtList.tsx');
  expectTokens(text, ["c.startsWith('WH1.')", "c.startsWith('AOS1.')", "c.startsWith('WC1.')", 'haptic.ok()', 'haptic.error()', 'После импорта команда проверяется по правилам']);
});
