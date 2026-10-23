// Снимок данных ростера wh-rules.ru (цены снаряжения так, как их считает конструктор ростеров сайта) →
// 40k/whrules-<версия>-roster.json. Задача P1-T5: платное снаряжение по данным источника, а не по догадкам из текста.
//
// Запуск: открыть https://wh-rules.ru/ru/patches и выполнить файл в консоли браузера. Результат:
//   window.__whrulesRoster   — компактный JSON снимка (одна строка);
//   window.__whrulesRosterGz — тот же JSON, gzip + base64 (для переноса);
// перенос: node scripts/whrules-save.mjs --roster <файл base64 или json> проверит схему и fingerprint.
// Схема whrules-roster/1:
//   source   — сайт, версия данных, MFM, дата, время снятия;
//   assets   — SHA-256 каждого прочитанного модуля сайта;
//   factions — по slug: модуль ростера фракции как есть, без detachments (units: sizes, step, minis, defaults, dw, gear, pools…;
//              у орденов — sharedUnitIds, unitPoints и т. п.);
//   items    — id предмета → название (только использованные), texts — id формулировки варианта → текст (только использованные);
//   fingerprint — SHA-256 от JSON.stringify(снимок без fingerprint).
// Поля конструктора (rosterEngine сайта): unit.dw = [[тип модели, очки за модель]] — стоимость платного стандартного
// снаряжения; gear[] — группы вариантов: m — тип модели, t — текст, o — варианты [предметы, очки], rep — что заменяется,
// dr — сколько очков возвращается за снятый стандартный предмет, keep — что остаётся, lim / cp / all / repall — лимиты.
(async () => {
  const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const assets = {};
  const read = async (f) => {
    const t = await (await fetch('/assets/' + f)).text();
    assets[f] = await sha(t);
    return t;
  };
  const html = await (await fetch('/ru/patches')).text();
  const index = await read(html.match(/assets\/(index-[A-Za-z0-9_-]+\.js)/)[1]);
  const app = await read(index.match(/(app-[A-Za-z0-9_-]+\.js)/)[1]);
  const rosterFile = [index, app].map((s) => s.match(/(roster-[A-Za-z0-9_-]+\.js)/)?.[1]).find(Boolean);
  const roster = await read(rosterFile);
  const itemsFile = roster.match(/\.\/(items-[A-Za-z0-9_-]+\.js)/)[1];
  await read(itemsFile);
  const dict = Object.values(await import('/assets/' + itemsFile))[0];
  // только основные модули фракций (не combat-patrol)
  const main = roster.slice(0, roster.indexOf('./combat-patrol/'));
  const mods = [...main.matchAll(/"\.\/([a-z-]+)\.js":\(\)=>[^(]*\(\(\)=>import\(`\.\/([A-Za-z0-9_-]+\.js)`\)/g)].map((x) => [x[1], x[2]]);
  const factions = {};
  const usedItems = new Set();
  const usedTexts = new Set();
  const collect = (v) => {
    if (typeof v === 'number') usedItems.add(v);
    else if (Array.isArray(v)) v.forEach(collect);
  };
  for (const [slug, file] of mods) {
    await read(file);
    const { detachments, ...mod } = (await import('/assets/' + file)).default;
    factions[slug] = mod;
    for (const u of mod.units ?? []) {
      for (const d of u.defaults ?? []) collect(d[1]);
      for (const g of u.gear ?? []) {
        if (g.t != null) usedTexts.add(g.t);
        for (const o of g.o ?? []) collect(o[0]);
        collect(g.rep ?? []);
        collect(g.keep ?? []);
      }
    }
  }
  const pick = (src, ids) => Object.fromEntries([...ids].sort((a, b) => a - b).filter((i) => src?.[i] != null).map((i) => [i, src[i]]));
  const pv = await read([index, app].map((s) => s.match(/(PatchesView-[A-Za-z0-9_-]+\.js)/)?.[1]).find(Boolean));
  const patches = [];
  for (const f of [...pv.matchAll(/import\(`\.\/(\d+-[A-Za-z0-9_-]+\.js)`\)/g)].map((x) => x[1])) {
    const m = await import('/assets/' + f);
    patches.push({ date: m.date, labels: m.labels });
  }
  const latest = patches.filter((p) => p.labels?.app).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const content = {
    schema: 'whrules-roster/1',
    source: { site: 'https://wh-rules.ru', dataVersion: latest.labels.app, mfm: latest.labels.mfm ?? null, date: latest.date, extractedAt: new Date().toISOString() },
    assets: Object.fromEntries(Object.entries(assets).sort()),
    omitted: ['detachments (есть в полном снимке)', 'combat-patrol'],
    factions,
    items: pick(dict.items, usedItems),
    texts: pick(dict.texts, usedTexts),
  };
  const json = JSON.stringify(content);
  window.__whrulesRoster = JSON.stringify({ ...content, fingerprint: await sha(json) });
  const gz = new Uint8Array(await new Response(new Blob([window.__whrulesRoster]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  let bin = '';
  for (const b of gz) bin += String.fromCharCode(b);
  window.__whrulesRosterGz = btoa(bin);
  return { factions: Object.keys(factions).length, units: Object.values(factions).reduce((s, f) => s + (f.units?.length ?? 0), 0), items: Object.keys(content.items).length, bytes: window.__whrulesRoster.length, gzBase64: window.__whrulesRosterGz.length, dataVersion: content.source.dataVersion, fingerprint: await sha(json) };
})();
