// Глоссарий wh-rules.ru → 40k/whrules-<версия>-glossary.json (карточки юнитов: всплывающие подсказки, 01.11.2026).
// Запуск: открыть https://wh-rules.ru/ru/patches и выполнить файл в консоли браузера. Результат:
//   window.__whrulesGlossary   — компактный JSON снимка (одна строка);
//   window.__whrulesGlossaryGz — тот же JSON, сжатый gzip, в base64 (для переноса частями);
// перенос: node scripts/whrules-glossary.mjs --save <файл base64 или json> проверит fingerprint и сохранит снимок.
// Схема whrules-glossary/1:
//   source         — сайт, версия данных, MFM, дата, время снятия;
//   assets         — SHA-256 каждого прочитанного модуля сайта;
//   coreAbilities  — раздел 24 основных правил: num, name ([BLAST], Deep Strike…), type (weapon | unit), en/ru: fullText, example;
//   glossary       — термины правил по id: term, en, ru (в текстах ссылки вида [gloss:id:текст]);
//   weaponAbilities — особые способности оружия фракций по названию: [{ en, ru }];
//   omitted        — что сознательно не снято (художественный текст flavor);
//   fingerprint    — SHA-256 от JSON.stringify(снимок без fingerprint).
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
  const mods = [...new Set([...app.matchAll(/import\(`?\.\/([A-Za-z0-9_-]+\.js)/g)].map((m) => m[1]))];
  const mod = async (prefix) => {
    const f = mods.find((m) => m.startsWith(prefix + '-'));
    if (!f) throw new Error('нет модуля ' + prefix);
    await read(f);
    return Object.values(await import('/assets/' + f));
  };

  const ref = (await mod('reference')).find((v) => v && typeof v === 'object' && 'coreAbilities' in v);
  const { en, ru } = ref.coreAbilities;
  if (!Array.isArray(en) || en.length !== ru.length) throw new Error('coreAbilities: en и ru разной длины');
  const coreAbilities = en.map((a, i) => ({
    num: a.num,
    name: a.name,
    type: a.type,
    en: { fullText: a.fullText, ...(a.example ? { example: a.example } : {}) },
    ru: { fullText: ru[i].fullText, ...(ru[i].example ? { example: ru[i].example } : {}) },
  }));

  const glossary = (await mod('glossary')).find((v) => v && typeof v === 'object' && v.base?.term);
  const weaponAbilities = (await mod('ownWeaponAbilities')).find((v) => v && typeof v === 'object' && Object.values(v).every((x) => Array.isArray(x)));

  const pv = await read([index, app].map((s) => s.match(/(PatchesView-[A-Za-z0-9_-]+\.js)/)?.[1]).find(Boolean));
  const patches = [];
  for (const f of [...pv.matchAll(/import\(`\.\/(\d+-[A-Za-z0-9_-]+\.js)`\)/g)].map((x) => x[1])) {
    const m = await import('/assets/' + f);
    patches.push({ date: m.date, labels: m.labels });
  }
  const latest = patches.filter((p) => p.labels?.app).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const content = {
    schema: 'whrules-glossary/1',
    source: { site: 'https://wh-rules.ru', dataVersion: latest.labels.app, mfm: latest.labels.mfm ?? null, date: latest.date, extractedAt: new Date().toISOString() },
    assets: Object.fromEntries(Object.entries(assets).sort()),
    omitted: ['flavor (художественный текст)'],
    coreAbilities,
    glossary: Object.fromEntries(Object.entries(glossary).sort(([a], [b]) => a.localeCompare(b)).map(([id, g]) => [id, { term: g.term, en: g.en, ru: g.ru }])),
    weaponAbilities: Object.fromEntries(Object.entries(weaponAbilities).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, v.map((x) => ({ en: x.en, ru: x.ru }))])),
  };
  const json = JSON.stringify(content);
  window.__whrulesGlossary = JSON.stringify({ ...content, fingerprint: await sha(json) });
  const gz = new Uint8Array(await new Response(new Blob([window.__whrulesGlossary]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  let bin = '';
  for (const b of gz) bin += String.fromCharCode(b);
  window.__whrulesGlossaryGz = btoa(bin);
  return {
    bytes: window.__whrulesGlossary.length,
    gzBase64: window.__whrulesGlossaryGz.length,
    fingerprint: await sha(json),
    dataVersion: content.source.dataVersion,
    mfm: content.source.mfm,
    date: content.source.date,
    coreAbilities: coreAbilities.length,
    glossary: Object.keys(content.glossary).length,
    weaponAbilities: Object.keys(content.weaponAbilities).length,
  };
})();
