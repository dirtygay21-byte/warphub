import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const source = (path: string) => readFileSync(new URL(`../../../client/src/features/roster/ui/skirmish/${path}`, import.meta.url), 'utf8');
const expectTokens = (text: string, tokens: string[]) => {
  for (const token of tokens) assert.ok(text.includes(token), `Отсутствует UI-контракт карты: ${token}`);
};
const readJson = (path: string) => JSON.parse(readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8'));
const hash = (path: string) => createHash('sha256').update(readFileSync(new URL(`../../../${path}`, import.meta.url))).digest('hex');

test('общий MapPanel показывает официальное изображение и рабочее увеличение', () => {
  const text = source('SkirmishMaps.tsx');
  expectTokens(text, ['function OfficialImage', 'setZoom', 'pushOverlay', "large ? 'w-[200%] max-w-none' : 'w-full'", 'Источник изображения', 'openExternal', 'safe-area-inset-bottom']);
  for (const forbidden of ['function KtMapSvg', 'function WarcryDeploymentSvg', 'data-feature-id', 'data-point-id', 'guideToggle']) {
    assert.ok(!text.includes(forbidden), `Реконструированный рендер должен быть удалён: ${forbidden}`);
  }
});

test('Kill Team и Warcry используют пути только к официальным PNG', () => {
  const text = source('SkirmishMaps.tsx');
  expectTokens(text, ['officialKtMapPath', 'officialWarcryMapPath', '/roster-maps/kt/', '/roster-maps/warcry/', 'Wahapedia', 'Warcrier']);
});

test('фон Board не содержит интерактивного MapPanel, а селекторы не переполняют экран', () => {
  const text = source('SkirmishTestArmyScreen.tsx');
  expectTokens(text, ['<KtMapPanel map={map} interactive={false} />', '<WarcryDeploymentPanel deployment={deployment} color={color} interactive={false} />', 'grid-cols-[minmax(0,1fr)_5rem]', 'grid-cols-[minmax(0,1fr)_7rem]', 'h-11 min-w-0']);
});

test('все 60 публичных PNG соответствуют проверенным SHA-256 официальных исходников', () => {
  const kt = readJson('backend/roster-data/kt/game.json');
  const warcry = readJson('backend/roster-data/warcry/game.json');
  const expected = readJson('tools/roster-data/tests/official-map-hashes.json').files as Record<string, string>;
  assert.equal(kt.maps.length, 36);
  assert.equal(warcry.deployments.length, 24);
  assert.equal(Object.keys(expected).length, 60);
  for (const map of kt.maps) {
    const name = `${map.killzone.replaceAll(' ', '-')}-${map.map}.png`;
    assert.equal(hash(`client/public/roster-maps/kt/${name}`), expected[`kt/${name}`], map.id);
  }
  for (const deployment of warcry.deployments) {
    const name = `${deployment.id}.png`;
    assert.equal(hash(`client/public/roster-maps/warcry/${name}`), expected[`warcry/${name}`], deployment.id);
  }
  assert.equal(expected['kt/Volkus-1.png'], 'fd95d9f062e57f1160c72caa687fe72b5cb27478b0ebb22c65f1d9506bbcd637');
});
