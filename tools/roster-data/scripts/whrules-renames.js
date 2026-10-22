// Снимок таблицы переименований инфолистов wh-rules.ru (модуль datasheetRenames сайта) для 40k/whrules-<версия>-renames.json.
//
// Запуск: открыть https://wh-rules.ru/ru/patches и выполнить файл в консоли браузера. Результат — строка JSON
// в window.__whrulesRenames; сохранить её в файл и запустить `node scripts/whrules-map.mjs --save-renames <файл>`.
// Таблица сайта: по фракции «старый slug → новый slug» (переименован) или null (сайт этот инфолист больше не показывает:
// убран из правил или Legends, которых на сайте нет). Сайт использует её, чтобы старые ростеры открывались.
// Схема whrules-renames/1: { schema, source { site, dataVersion, date, extractedAt, asset, assetSha256 }, renames, fingerprint }.
(async () => {
  const FACTIONS = ['space-marines', 'black-templars', 'blood-angels', 'dark-angels', 'deathwatch', 'space-wolves', 'imperial-agents'];
  const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const html = await (await fetch('/ru/patches')).text();
  const index = await (await fetch('/assets/' + html.match(/assets\/(index-[A-Za-z0-9_-]+\.js)/)[1])).text();
  const app = await (await fetch('/assets/' + index.match(/(app-[A-Za-z0-9_-]+\.js)/)[1])).text();
  const asset = [index, app].map((s) => s.match(/(datasheetRenames-[A-Za-z0-9_-]+\.js)/)?.[1]).find(Boolean);
  if (!asset) throw new Error('нет модуля datasheetRenames');
  const text = await (await fetch('/assets/' + asset)).text();
  const all = (await import('/assets/' + asset)).default;
  // версия данных — последняя запись истории обновлений
  const pv = await (await fetch('/assets/' + [index, app].map((s) => s.match(/(PatchesView-[A-Za-z0-9_-]+\.js)/)?.[1]).find(Boolean))).text();
  const patches = [];
  for (const f of [...pv.matchAll(/import\(`\.\/(\d+-[A-Za-z0-9_-]+\.js)`\)/g)].map((x) => x[1])) {
    const m = await import('/assets/' + f);
    patches.push({ id: m.id, date: m.date, app: m.labels?.app });
  }
  const latest = patches.filter((p) => p.app).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const content = {
    schema: 'whrules-renames/1',
    source: { site: 'https://wh-rules.ru', dataVersion: latest.app, date: latest.date, extractedAt: new Date().toISOString(), asset, assetSha256: await sha(text) },
    renames: Object.fromEntries(FACTIONS.map((f) => [f, all[f] ?? {}])),
  };
  const json = JSON.stringify(content);
  window.__whrulesRenames = JSON.stringify({ ...content, fingerprint: await sha(json) });
  return { bytes: window.__whrulesRenames.length, fingerprint: await sha(json), dataVersion: latest.app, date: latest.date };
})();
