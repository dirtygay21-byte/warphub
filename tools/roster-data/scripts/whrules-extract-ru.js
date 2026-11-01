// Русские тексты фракций 40K с wh-rules.ru → 40k/whrules-<версия>-ru.json (решение владельца 01.11.2026: всё, что есть на
// wh-rules.ru по-русски, показывать по-русски; тексты берутся с сайта как есть, ничего не переводится вручную).
// Запуск: открыть https://wh-rules.ru/ru/patches и выполнить файл в консоли браузера. Результат:
//   window.__whrulesRu   — компактный JSON снимка; window.__whrulesRuGz — gzip + base64 (для переноса);
// перенос: node scripts/whrules-ru.mjs --save <файл> проверит fingerprint и сохранит снимок.
// Схема whrules-ru/1:
//   source, assets, fingerprint — как у whrules-full/1;
//   factions[slug]:
//     faction    — модуль фракции на русском: armyRuleNameRu, armyRule (body), detachments[] (rule / stratagems / enhancements),
//                  detNamesRu, detRuleNamesRu, enhNamesRu, stratNamesRu (английское название → русское);
//     datasheets — инфолисты по id wh-rules: abilities (англ. название → русский текст), loadout, options, leader, transport…
//                  (как их отдаёт сайт: свой загрузчик ru-*.js, с общими юнитами Space Marines у орденов);
//     abilityNamesRu — английское название способности → русское;
//     en         — английский модуль фракции (только id и названия) в том же порядке, что faction.detachments: по нему тексты
//                  детачментов, стратагем и улучшений привязываются к данным приложения;
//   omitted — художественный текст flavor.
(async () => {
  const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const assets = {};
  const read = async (f) => {
    const t = await (await fetch('/assets/' + f)).text();
    assets[f] = await sha(t);
    return t;
  };
  const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'flavor' ? undefined : v)));
  const html = await (await fetch('/ru/patches')).text();
  const index = await read(html.match(/assets\/(index-[A-Za-z0-9_-]+\.js)/)[1]);
  const app = await read(index.match(/(app-[A-Za-z0-9_-]+\.js)/)[1]);
  const mods = [...new Set([...app.matchAll(/import\(`?\.\/([A-Za-z0-9_-]+\.js)/g)].map((m) => m[1]))];

  // загрузчик русских инфолистов сайта (ru-*.js): карта «./<slug>.js» → модуль и функция, которую вызывает страница инфолиста
  const ruFile = mods.find((m) => /^ru-[A-Za-z0-9_-]+\.js$/.test(m));
  const ruText = await read(ruFile);
  const ruLoader = await import('/assets/' + ruFile);
  const load = Object.values(ruLoader).find((f) => typeof f === 'function' && /cp:/.test(String(f)));
  if (!load) throw new Error('не найден загрузчик русских инфолистов');
  const slugs = [...ruText.matchAll(/"\.\/([a-z-]+)\.js":\(\)=>\w+\(\(\)=>import\(`\.\/([A-Za-z0-9_-]+\.js)`\)/g)].map((m) => ({ slug: m[1], file: m[2] }));
  for (const s of slugs) await read(s.file);

  const factions = {};
  for (const { slug } of slugs) {
    const ds = await load(slug);
    // модуль фракции на русском: среди модулей «<slug>-*.js» тот, что экспортирует detNamesRu
    let faction = null;
    let en = null;
    for (const f of mods.filter((m) => m.startsWith(slug + '-') && new RegExp(`^${slug}-[A-Za-z0-9_-]{8}\\.js$`).test(m))) {
      const m = await import('/assets/' + f);
      if (!faction && ('detNamesRu' in m || 'armyRuleNameRu' in m)) {
        await read(f);
        faction = strip({ ...m.default, ...Object.fromEntries(Object.entries(m).filter(([k]) => k !== 'default')) });
      }
      // английский модуль фракции: те же детачменты в том же порядке — по нему русские тексты привязываются к id и названиям
      // экспорт вида { <slug>: { en, ru } } (или сам объект фракции)
      const e = !en && Object.values(m).map((v) => v?.en ?? v).find((v) => v && v.slug === slug && Array.isArray(v.detachments));
      if (e) {
        await read(f);
        en = {
          armyRule: e.armyRule ? { id: e.armyRule.id ?? null, name: e.armyRule.name } : null,
          detachments: e.detachments.map((d) => ({ id: d.id, name: d.name, rule: d.rule?.name ?? null, stratagems: (d.stratagems ?? []).map((x) => x.name), enhancements: (d.enhancements ?? []).map((x) => x.name) })),
        };
      }
    }
    factions[slug] = { faction, en, datasheets: strip(ds?.default ?? {}), abilityNamesRu: ds?.abilityNamesRu ?? {} };
  }

  const pv = await read([index, app].map((s) => s.match(/(PatchesView-[A-Za-z0-9_-]+\.js)/)?.[1]).find(Boolean));
  const patches = [];
  for (const f of [...pv.matchAll(/import\(`\.\/(\d+-[A-Za-z0-9_-]+\.js)`\)/g)].map((x) => x[1])) {
    const m = await import('/assets/' + f);
    patches.push({ date: m.date, labels: m.labels });
  }
  const latest = patches.filter((p) => p.labels?.app).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const content = {
    schema: 'whrules-ru/1',
    source: { site: 'https://wh-rules.ru', dataVersion: latest.labels.app, mfm: latest.labels.mfm ?? null, date: latest.date, extractedAt: new Date().toISOString() },
    assets: Object.fromEntries(Object.entries(assets).sort()),
    omitted: ['flavor (художественный текст)'],
    factions: Object.fromEntries(Object.entries(factions).sort(([a], [b]) => a.localeCompare(b))),
  };
  const json = JSON.stringify(content);
  window.__whrulesRu = JSON.stringify({ ...content, fingerprint: await sha(json) });
  const gz = new Uint8Array(await new Response(new Blob([window.__whrulesRu]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  let bin = '';
  for (const b of gz) bin += String.fromCharCode(b);
  window.__whrulesRuGz = btoa(bin);
  return {
    bytes: window.__whrulesRu.length,
    gzBase64: window.__whrulesRuGz.length,
    sha256: await sha(window.__whrulesRu),
    fingerprint: await sha(json),
    dataVersion: content.source.dataVersion,
    factions: Object.fromEntries(Object.entries(factions).map(([s, f]) => [s, { faction: !!f.faction, en: f.en?.detachments.length ?? null, ru: f.faction?.detachments?.length ?? null, datasheets: Object.keys(f.datasheets).length, abilityNames: Object.keys(f.abilityNamesRu).length }])),
  };
})();
