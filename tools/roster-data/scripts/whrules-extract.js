// Снимок очков всех фракций с https://wh-rules.ru для 40k/whrules-<версия>.json (схема whrules-points-snapshot/3).
//
// Запуск: открыть https://wh-rules.ru/ru/patches в браузере и выполнить весь этот файл в консоли (или через
// инструмент выполнения JS на странице). Результат — строка JSON в window.__whrulesSnapshot (компактная, одна строка)
// и она же, сжатая gzip, в base64 — window.__whrulesSnapshotGz (для переноса частями). Сохранение:
// node scripts/whrules-save.mjs <файл JSON или base64> — проверит схему и fingerprint и запишет файл.
// Сайт сам ничего не отдаёт как API: данные лежат в JS-модулях сборки, имена модулей берутся из самой сборки,
// поэтому скрипт переживает пересборку сайта. Ничего не пишет на сайт и не меняет страницу.
//
// Фракции: по умолчанию все, что есть в сборке сайта (карта «./<фракция>.js»); можно ограничить, задав до запуска
// window.__whrulesFactions = ['space-marines', …]. Неизвестная фракция — ошибка, а не пропуск.
//
// Что попадает в снимок (схема whrules-points-snapshot/3; /2 — то же без платного снаряжения; /1 — 7 фракций без детачментов
// и переименований):
//   source   — сайт, версия данных приложения, версия Munitorum Field Manual, дата обновления, время снятия;
//   assets   — SHA-256 текста каждого прочитанного модуля (по ним видно, что снимок сделан с той же сборки);
//   factions — по фракции: name; инфолисты {id, name, legends, points[{models|label, points, note}], wargearPoints[{name, points}]}
//              (запись points без models и note — платная добавка, например платформа Tidewall Shieldline);
//              у орденов ещё pointsOverrides (свои цены общих юнитов) и sharedUnitIds (общие юниты Space Marines);
//              detachments [{id, name, dp, enhancements[{name, points}]}] (текст правил не снимается);
//              renames — таблица сайта «старый slug инфолиста → новый slug» или null (инфолист убран);
//   patches  — история обновлений {id, date, labels, counts по фракциям} и изменения очков (kind = points);
//   fingerprint — SHA-256 от JSON.stringify(снимок без fingerprint): проверка, что файл не изменился при переносе.
(async () => {
  const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const assets = {};
  const read = async (f) => {
    const t = await (await fetch('/assets/' + f)).text();
    assets[f] = await sha(t);
    return t;
  };
  // входной модуль страницы → модуль приложения → карта «./<фракция>.js» → модули данных фракции
  const html = await (await fetch('/ru/patches')).text();
  const index = await read(html.match(/assets\/(index-[A-Za-z0-9_-]+\.js)/)[1]);
  const app = await read(index.match(/(app-[A-Za-z0-9_-]+\.js)/)[1]);
  // с версии приложения 2.12 (ноябрь 2026) карта модулей данных лежит в builtinSource-*.js с ключами «../data/<раздел>/<фракция>.js»
  const bsFile = [index, app].map((x) => x.match(/(builtinSource-[A-Za-z0-9_-]+\.js)/)?.[1]).find(Boolean);
  const bs = bsFile ? await read(bsFile) : '';
  const dataMap = Object.fromEntries([...bs.matchAll(/"\.\.\/data\/([^"]+)":\(\)=>[^(]*\(\(\)=>import\(`\.\/([A-Za-z0-9._-]+\.js)`/g)].map((m) => [m[1], m[2]]));
  const onSite = bsFile
    ? Object.keys(dataMap).filter((k) => /^datasheets\/[a-z-]+\.js$/.test(k)).map((k) => k.slice(11, -3)).sort()
    : [...new Set([...app.matchAll(/"\.\/([a-z-]+)\.js":\(\)=>[^(]*\(\(\)=>import\(`\.\/\1-[A-Za-z0-9_-]+\.js`/g)].map((m) => m[1]))].sort();
  const FACTIONS = window.__whrulesFactions ?? onSite;
  const unknown = FACTIONS.filter((f) => !onSite.includes(f));
  if (unknown.length) throw new Error(`нет на сайте: ${unknown.join(', ')}`);
  // «./<фракция>.js» встречается в нескольких картах (описание фракции, переводы, инфолисты)
  const modulesOf = (slug) => bsFile
    ? [`datasheets/${slug}.js`, `factions/${slug}.js`].map((k) => dataMap[k]).filter(Boolean)
    : [...app.matchAll(new RegExp(`"\\./${slug}\\.js":\\(\\)=>[^(]*\\(\\(\\)=>import\\(\`\\./(${slug}-[A-Za-z0-9_-]+\\.js)\``, 'g'))].map((x) => x[1]);
  // таблица переименований инфолистов (сайт по ней открывает старые ростеры)
  const renAsset = [index, app, bs].map((s) => s.match(/(datasheetRenames-[A-Za-z0-9_-]+\.js)/)?.[1]).find(Boolean);
  if (!renAsset) throw new Error('нет модуля datasheetRenames');
  await read(renAsset);
  const renames = (await import('/assets/' + renAsset)).default ?? {};
  const factions = {};
  for (const slug of FACTIONS) {
    let dsFile = null;
    let ds = null;
    let metaFile = null;
    let meta = null;
    for (const f of modulesOf(slug)) {
      const m = await import('/assets/' + f);
      if (Array.isArray(m.default) && m.default.some((d) => d && Array.isArray(d.points))) [dsFile, ds] = [f, m];
      else {
        // описание фракции: единственный именованный экспорт { en, ru }; модуль переводов (…Ru) пропускаем
        const v = Object.entries(m).find(([k, x]) => !/Ru$/.test(k) && k !== 'default' && x && x.en)?.[1];
        if (v) [metaFile, meta] = [f, v.en];
      }
    }
    if (!dsFile || !metaFile) throw new Error(`нет модуля данных ${slug}: инфолисты ${dsFile}, описание ${metaFile}`);
    await read(dsFile);
    await read(metaFile);
    factions[slug] = {
      name: meta.name,
      file: dsFile,
      metaFile,
      datasheets: ds.default.map((d) => ({ id: d.id, name: d.name, legends: !!d.legends, points: (d.points ?? []).map((p) => ({ ...p })), ...(d.wargearPoints?.length ? { wargearPoints: d.wargearPoints.map((w) => ({ ...w })) } : {}) })),
      ...(ds.pointsOverrides ? { pointsOverrides: ds.pointsOverrides } : {}),
      ...(ds.sharedUnitIds ? { sharedUnitIds: ds.sharedUnitIds } : {}),
      detachments: (meta.detachments ?? []).map((d) => ({
        id: d.id,
        name: d.name,
        dp: d.dp ?? null,
        enhancements: (d.enhancements ?? []).map((e) => ({ name: e.name, points: e.points ?? null })),
      })),
      renames: renames[slug] ?? {},
    };
  }
  // история обновлений: модули перечислены в PatchesView
  const pvFile = [index, app, html].map((s) => s.match(/(PatchesView-[A-Za-z0-9_-]+\.js)/)?.[1]).find(Boolean);
  if (!pvFile) throw new Error('нет модуля истории обновлений');
  const pv = await read(pvFile);
  const patchFiles = [...pv.matchAll(/import\(`\.\/([A-Za-z0-9._-]+\.js)`\)/g)].map((x) => x[1]).filter((f) => /^(\d+|mfm-[\d.]+)-/.test(f));
  const patches = [];
  for (const f of patchFiles) {
    await read(f);
    const m = await import('/assets/' + f);
    const counts = {};
    for (const i of m.items) counts[i.faction ?? 'core'] = (counts[i.faction ?? 'core'] ?? 0) + 1;
    patches.push({
      id: m.id,
      date: m.date,
      labels: m.labels,
      counts,
      points: m.items.filter((i) => i.kind === 'points' && FACTIONS.includes(i.faction)).map((i) => ({ faction: i.faction, name: i.name, change: i.change, ...(i.fields ? { fields: i.fields } : {}) })),
    });
  }
  patches.sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));
  const latest = patches.filter((p) => p.labels?.app).at(-1);
  const content = {
    schema: 'whrules-points-snapshot/3',
    source: {
      site: 'https://wh-rules.ru',
      pages: ['https://wh-rules.ru/ru/patches', ...FACTIONS.map((s) => `https://wh-rules.ru/ru/factions/${s}/datasheets`)],
      dataVersion: latest.labels.app,
      mfm: latest.labels.mfm ?? null,
      date: latest.date,
      extractedAt: new Date().toISOString(),
    },
    assets: Object.fromEntries(Object.entries(assets).sort()),
    factions,
    patches,
  };
  const json = JSON.stringify(content);
  window.__whrulesSnapshot = JSON.stringify({ ...content, fingerprint: await sha(json) });
  const gz = new Uint8Array(await new Response(new Blob([window.__whrulesSnapshot]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  let bin = '';
  for (const b of gz) bin += String.fromCharCode(b);
  window.__whrulesSnapshotGz = btoa(bin);
  return { bytes: window.__whrulesSnapshot.length, gzBase64: window.__whrulesSnapshotGz.length, fingerprint: await sha(json), factions: FACTIONS.length, dataVersion: content.source.dataVersion, mfm: content.source.mfm, date: content.source.date };
})();
