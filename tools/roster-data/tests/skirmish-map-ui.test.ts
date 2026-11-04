import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path: string) => readFileSync(new URL(`../../../client/src/features/roster/ui/skirmish/${path}`, import.meta.url), 'utf8');
const expectTokens = (text: string, tokens: string[]) => {
  for (const token of tokens) assert.ok(text.includes(token), `Отсутствует UI-контракт карты: ${token}`);
};

test('общий MapPanel имеет zoom, размеры, легенду, источник и выбор элемента', () => {
  const text = source('SkirmishMaps.tsx');
  expectTokens(text, ['setZoom', 'pushOverlay', 'showGuides', 'selected', 'details(selected)', 'sourceName', 'sourceUrl', 'openExternal', 'safe-area-inset-bottom']);
});

test('Kill Team использует drop zones, territories, features, стены, двери и guides', () => {
  const text = source('SkirmishMaps.tsx');
  expectTokens(text, ['map.territories', 'map.zones', 'map.features', 'map.walls', 'map.doors', 'map.guides', 'feature.label', 'hasPoly', 'validTerrain']);
});

test('Warcry использует исходные off-board координаты, orientation и резерв без начального круга', () => {
  const text = source('SkirmishMaps.tsx');
  expectTokens(text, ['point.sourceX', 'point.sourceY', 'deployment.orientation.at', 'Math.min', 'Math.max', '!point.reserve', 'RND{point.reserve}']);
  assert.ok(!text.includes('point.x, point.y'), 'координаты должны идти через sourceX/sourceY');
});

test('фон Board не содержит интерактивного MapPanel', () => {
  const text = source('SkirmishTestArmyScreen.tsx');
  expectTokens(text, ['<KtMapPanel map={map} interactive={false} />', '<WarcryDeploymentPanel deployment={deployment} color={color} interactive={false} />', 'grid-cols-[minmax(0,1fr)_5rem]', 'grid-cols-[minmax(0,1fr)_7rem]', 'h-11 min-w-0']);
});

test('увеличенные hit areas не переключают выбор дважды при всплытии к группе', () => {
  const text = source('SkirmishMaps.tsx');
  const hitAreas = text.split('\n').filter((line) => line.includes('data-feature-id=') || line.includes('data-point-id='));
  assert.equal(hitAreas.length, 2);
  for (const line of hitAreas) assert.ok(!line.includes('onClick='), 'обработчик должен быть только на родительской группе');
});
