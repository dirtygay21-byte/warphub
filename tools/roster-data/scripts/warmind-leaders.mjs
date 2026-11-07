/**
 * Leader по Warmind (решение владельца 07.11.2026: списки «к каким юнитам присоединяется» — как у Warmind).
 * Обработчик curated.updates kind «warmind-leaders»: у своих инфолистов армий scope добавляет в leads юниты из attachTo
 * Warmind, если юнит с таким названием есть в файле армии (не устаревший). Наши связи не убираются (у Warmind бывает
 * уже: Deathwatch Kill Team у Inquisitor). Снимок — 40k/warmind-11e.json (scripts/warmind-compare.mjs).
 * Каждое добавление — в строках отчёта; полный список — 40k/warmind-leaders-applied.json (пишет warmind-compare --leaders).
 */
import fs from 'node:fs';
import path from 'node:path';
import { ARMIES } from './whrules-compare.mjs';
import { CHAPTERS, norm } from './warmind-compare.mjs';

export function warmindLeadersPlan(files, wm, scope) {
  const out = [];
  for (const army of scope) {
    const F = files[`${army}.json`];
    const slugs = ARMIES[army];
    if (!F || !slugs) continue;
    const units = new Map();
    for (const s of slugs) for (const u of wm.factions.find((f) => f.id === s)?.units ?? []) if (!units.has(`${s}|${norm(u.name)}`)) units.set(`${s}|${norm(u.name)}`, u);
    const siteOf = (d) => (army === 'SM' ? CHAPTERS[Object.keys(CHAPTERS).find((c) => d.factionKeywords?.includes(c))] ?? 'space-marines' : slugs[0]);
    const byName = new Map();
    for (const d of F.datasheets.filter((x) => !x.outdated)) {
      const k = norm(d.name);
      // свой инфолист важнее копии
      if (!byName.has(k) || (d.group === 'own' && byName.get(k).group !== 'own')) byName.set(k, d);
    }
    for (const d of F.datasheets.filter((x) => x.group === 'own' && x.faction === F.id && !x.outdated)) {
      const u = units.get(`${siteOf(d)}|${norm(d.name)}`) ?? slugs.map((s) => units.get(`${s}|${norm(d.name)}`)).find(Boolean);
      if (!u?.attachTo?.length) continue;
      const add = u.attachTo.map((n) => byName.get(norm(n))).filter((t) => t && t.id !== d.id && !(d.leads ?? []).includes(t.id));
      if (add.length) out.push({ army, id: d.id, name: d.name, add: [...new Map(add.map((t) => [t.id, t])).values()].map((t) => ({ id: t.id, name: t.name, group: t.group })) });
    }
  }
  return out;
}

export function applyWarmindLeaders(files, wm, u) {
  const plan = warmindLeadersPlan(files, wm, u.scope ?? Object.keys(ARMIES));
  for (const p of plan) {
    const d = files[`${p.army}.json`].datasheets.find((x) => x.id === p.id && x.group === 'own');
    d.leads = [...(d.leads ?? []), ...p.add.map((t) => t.id)];
  }
  const n = plan.reduce((s, p) => s + p.add.length, 0);
  return { changed: n, lines: [`Leader по Warmind: добавлено связей ${n} у ${plan.length} инфолистов (${[...new Set(plan.map((p) => p.army))].join(', ') || '—'})`] };
}
applyWarmindLeaders.load = (file, dir) => {
  const wm = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  if (wm.schema !== 'warmind-11e/1' || !/^[0-9a-f]{64}$/.test(wm.fingerprint ?? '')) throw new Error(`warmind-leaders: снимок ${file} — неверная схема или нет fingerprint`);
  // версия данных Warmind 11e — версия MFM у фракций (1.6)
  return { ...wm, source: { site: wm.source.site, dataVersion: wm.factions[0]?.version ?? null, mfm: wm.factions[0]?.version ?? null, date: wm.source.extractedAt.slice(0, 10) } };
};
