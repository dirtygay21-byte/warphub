// Снимок очков Space Marines, орденов и Imperial Agents с https://wh-rules.ru для 40k/whrules-<версия>.json.
//
// Запуск: открыть https://wh-rules.ru/ru/patches в браузере и выполнить весь этот файл в консоли (или через
// инструмент выполнения JS на странице). Результат — строка JSON в window.__whrulesSnapshot (компактная, одна строка);
// её сохраняют в tools/roster-data/40k/whrules-<dataVersion>.json (scripts/whrules-save.mjs форматирует и проверяет).
// Сайт сам ничего не отдаёт как API: данные лежат в JS-модулях сборки, имена модулей берутся из самой сборки,
// поэтому скрипт переживает пересборку сайта. Ничего не пишет на сайт и не меняет страницу.
//
// Что попадает в снимок (схема whrules-points-snapshot/1):
//   source   — сайт, версия данных приложения, версия Munitorum Field Manual, дата обновления, время снятия;
//   assets   — SHA-256 текста каждого прочитанного модуля (по ним видно, что снимок сделан с той же сборки);
//   factions — по фракции: инфолисты {id, name, legends, points[{models|label, points, note}]},
//              у орденов ещё pointsOverrides (свои цены общих юнитов) и sharedUnitIds (общие юниты Space Marines);
//   patches  — история обновлений {id, date, labels} и изменения очков юнитов этих фракций (kind = points);
//   fingerprint — SHA-256 от JSON.stringify(снимок без fingerprint): проверка, что файл не изменился при переносе.
(async () => {
  const FACTIONS = ['space-marines', 'black-templars', 'blood-angels', 'dark-angels', 'deathwatch', 'space-wolves', 'imperial-agents'];
  const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const text = async (f) => (await fetch('/assets/' + f)).text();
  const assets = {};
  const read = async (f) => {
    const t = await text(f);
    assets[f] = await sha(t);
    return t;
  };
  // входной модуль страницы → модуль приложения → карта «./<фракция>.js» → модуль данных фракции
  const html = await (await fetch('/ru/patches')).text();
  const entry = html.match(/assets\/(index-[A-Za-z0-9_-]+\.js)/)[1];
  const index = await read(entry);
  const appFile = index.match(/(app-[A-Za-z0-9_-]+\.js)/)[1];
  const app = await read(appFile);
  // «./<фракция>.js» встречается в нескольких картах (описание фракции, переводы, инфолисты) — берём модуль,
  // у которого default — массив инфолистов с очками
  const modulesOf = (slug) => [...app.matchAll(new RegExp(`"\\./${slug}\\.js":\\(\\)=>[^(]*\\(\\(\\)=>import\\(\`\\./(${slug}-[A-Za-z0-9_-]+\\.js)\``, 'g'))].map((x) => x[1]);
  const factions = {};
  for (const slug of FACTIONS) {
    let file = null;
    let m = null;
    for (const f of modulesOf(slug)) {
      const mod = await import('/assets/' + f);
      if (Array.isArray(mod.default) && mod.default.some((d) => d && Array.isArray(d.points))) {
        file = f;
        m = mod;
        break;
      }
    }
    if (!file) throw new Error(`нет модуля инфолистов для ${slug}`);
    await read(file);
    // у орденов, кроме своих инфолистов, — pointsOverrides и sharedUnitIds
    const list = m.default;
    factions[slug] = {
      file,
      datasheets: list.map((d) => ({ id: d.id, name: d.name, legends: !!d.legends, points: (d.points ?? []).map((p) => ({ ...p })) })),
      ...(m.pointsOverrides ? { pointsOverrides: m.pointsOverrides } : {}),
      ...(m.sharedUnitIds ? { sharedUnitIds: m.sharedUnitIds } : {}),
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
    patches.push({
      id: m.id,
      date: m.date,
      labels: m.labels,
      points: m.items.filter((i) => i.kind === 'points' && FACTIONS.includes(i.faction)).map((i) => ({ faction: i.faction, name: i.name, change: i.change, ...(i.fields ? { fields: i.fields } : {}) })),
    });
  }
  patches.sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));
  const latest = patches.filter((p) => p.labels?.app).at(-1);
  const content = {
    schema: 'whrules-points-snapshot/1',
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
  return { bytes: window.__whrulesSnapshot.length, fingerprint: await sha(json), dataVersion: content.source.dataVersion, mfm: content.source.mfm, date: content.source.date };
})();
