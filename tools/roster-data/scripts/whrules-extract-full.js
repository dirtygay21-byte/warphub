// Полный снимок данных wh-rules.ru для Space Marines, 5 орденов и Imperial Agents → 40k/whrules-<версия>-full.json.
//
// Запуск: открыть https://wh-rules.ru/ru/patches и выполнить файл в консоли браузера. Результат:
//   window.__whrulesFull     — компактный JSON снимка (одна строка);
//   window.__whrulesFullGz   — тот же JSON, сжатый gzip, в base64 (для переноса частями);
// перенос: node scripts/whrules-map.mjs --save-full <файл base64 или json> проверит fingerprint и сохранит снимок.
// Схема whrules-full/1:
//   source   — сайт, версия данных, MFM, дата, время снятия;
//   assets   — SHA-256 каждого прочитанного модуля сайта;
//   factions — по фракции: datasheets (инфолисты целиком: профили, оружие, способности, состав, снаряжение, варианты,
//              ключевые слова, лидер, транспорт, очки, Legends, источник), pointsOverrides/sharedUnitIds у орденов,
//              armyRule, detachments (правило, улучшения с очками, стратагемы, DP, диспозиции), chapters у Space Marines;
//   omitted  — что сознательно не снято (художественный текст flavor и русские переводы — приложению не нужны);
//   fingerprint — SHA-256 от JSON.stringify(снимок без fingerprint).
(async () => {
  const FACTIONS = ['space-marines', 'black-templars', 'blood-angels', 'dark-angels', 'deathwatch', 'space-wolves', 'imperial-agents'];
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
  const modulesOf = (slug) => [...app.matchAll(new RegExp(`"\\./${slug}\\.js":\\(\\)=>[^(]*\\(\\(\\)=>import\\(\`\\./(${slug}-[A-Za-z0-9_-]+\\.js)\``, 'g'))].map((x) => x[1]);
  const factions = {};
  for (const slug of FACTIONS) {
    let dsFile = null;
    let metaFile = null;
    let ds = null;
    let meta = null;
    for (const f of modulesOf(slug)) {
      const m = await import('/assets/' + f);
      if (Array.isArray(m.default) && m.default.some((d) => d && Array.isArray(d.points))) [dsFile, ds] = [f, m];
      else {
        // описание фракции: единственный именованный экспорт { en, ru }; модуль переводов (…NamesRu) пропускаем
        const v = Object.entries(m).find(([k, x]) => !/Ru$/.test(k) && k !== 'default' && x && x.en)?.[1];
        if (v) [metaFile, meta] = [f, v.en];
      }
    }
    if (!dsFile || !metaFile) throw new Error(`нет модуля данных ${slug}: инфолисты ${dsFile}, описание ${metaFile}`);
    await read(dsFile);
    await read(metaFile);
    const { datasheets: metaDs, ...metaRest } = meta;
    if (Array.isArray(metaDs) && metaDs.length) throw new Error(`${slug}: инфолисты в описании фракции — не учтены`);
    factions[slug] = {
      datasheetsFile: dsFile,
      metaFile,
      datasheets: strip(ds.default),
      ...(ds.pointsOverrides ? { pointsOverrides: ds.pointsOverrides } : {}),
      ...(ds.sharedUnitIds ? { sharedUnitIds: ds.sharedUnitIds } : {}),
      ...strip(metaRest),
    };
  }
  const pv = await read([index, app].map((s) => s.match(/(PatchesView-[A-Za-z0-9_-]+\.js)/)?.[1]).find(Boolean));
  const patches = [];
  for (const f of [...pv.matchAll(/import\(`\.\/(\d+-[A-Za-z0-9_-]+\.js)`\)/g)].map((x) => x[1])) {
    const m = await import('/assets/' + f);
    patches.push({ date: m.date, labels: m.labels });
  }
  const latest = patches.filter((p) => p.labels?.app).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const content = {
    schema: 'whrules-full/1',
    source: { site: 'https://wh-rules.ru', dataVersion: latest.labels.app, mfm: latest.labels.mfm ?? null, date: latest.date, extractedAt: new Date().toISOString() },
    assets: Object.fromEntries(Object.entries(assets).sort()),
    omitted: ['flavor (художественный текст)', 'русские переводы названий'],
    factions,
  };
  const json = JSON.stringify(content);
  window.__whrulesFull = JSON.stringify({ ...content, fingerprint: await sha(json) });
  const gz = new Uint8Array(await new Response(new Blob([window.__whrulesFull]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  let bin = '';
  for (const b of gz) bin += String.fromCharCode(b);
  window.__whrulesFullGz = btoa(bin);
  return { bytes: window.__whrulesFull.length, sha256: await sha(window.__whrulesFull), fingerprint: await sha(json), gzBase64: window.__whrulesFullGz.length, dataVersion: content.source.dataVersion, mfm: content.source.mfm, date: content.source.date };
})();
