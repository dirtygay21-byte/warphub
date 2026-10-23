/**
 * Карты миссий Chapter Approved 2026-27 для экрана «Поле боя» → backend/roster-data/missions.json (P2-T1).
 *
 *   npm run missions -- --src <папка 40kdc-data>      (по умолчанию ./40kdc-data)
 *
 * Состав карт, id, тип (основная/вторичная), пары типов армий и лимиты ПО — из 40kdc-data (CC BY 4.0).
 * Текст карт — свой, на русском (40k/missions-ru.json): смысл и числа как на карте, без художественного текста.
 * Сверка: изображения карт game-datamissions.com, правила колоды миссий и данные wh-rules.ru (отчёт 40k/missions-review.json).
 * Сборка падает, если карты, пары или очки в тексте расходятся со структурой 40kdc без записи в отчёте.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const SRC = path.resolve(arg('--src', path.join(here, '..', '40kdc-data')));
const OUT = path.resolve(arg('--out', path.join(here, '..', '..', '..', 'backend', 'roster-data', 'missions.json')));
const DATA = path.join(here, '..', '40k');

const core = (f) => JSON.parse(fs.readFileSync(path.join(SRC, 'data', 'core', f), 'utf8'));
const json = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

/** Сравнение очков текста с наградами 40kdc (мультимножество значений ПО). Расхождение допустимо только из отчёта. */
export function vpDiff(card, kdc) {
  const count = (vals) => vals.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map());
  const ours = count(card.blocks.flatMap((b) => b.rows.map((r) => r.vp)));
  const theirs = count((kdc.awards ?? []).map((a) => a.vp ?? a.vp_per));
  const diff = [];
  for (const v of new Set([...ours.keys(), ...theirs.keys()])) {
    const d = (ours.get(v) ?? 0) - (theirs.get(v) ?? 0);
    if (d) diff.push({ vp: v, delta: d });
  }
  return diff.sort((a, b) => a.vp - b.vp);
}

/**
 * Чей ход должен заканчиваться, чтобы блок вторичной миссии засчитывался (G2.11a): own — ваш, opponent — противника,
 * any — любой, opponent-or-r5 — противника или конец 5-го раунда (что раньше). Должно совпадать с текстом «when».
 */
export const SECONDARY_TURN = {
  'Конец вашего хода': 'own',
  'Конец любого хода': 'any',
  'Конец хода любого игрока': 'any',
  'Конец хода противника': 'opponent',
  'Конец хода противника или конец 5-го раунда — что наступит раньше': 'opponent-or-r5',
  'Пока карта активна': 'any',
};

export function buildMissions({ cards, missions, matchups, ru, review, version }) {
  const kdcById = new Map(cards.map((c) => [c.id, c]));
  const errors = [];
  const allowed = new Map((review.conflicts ?? []).filter((c) => c.vpDiff).map((c) => [c.card, JSON.stringify(c.vpDiff)]));
  for (const id of kdcById.keys()) if (!ru.cards[id]) errors.push(`нет текста карты ${id}`);
  for (const id of Object.keys(ru.cards)) if (!kdcById.has(id)) errors.push(`лишняя карта ${id}`);
  const pair = new Map(matchups.map((m) => [m.mission_id, [m.disposition, m.opponent_disposition]]));
  const out = [];
  for (const [id, t] of Object.entries(ru.cards)) {
    const k = kdcById.get(id);
    if (!k) continue;
    if (k.card_type !== t.type) errors.push(`${id}: тип ${t.type}, в 40kdc ${k.card_type}`);
    if (t.type === 'primary') {
      const p = pair.get(id);
      if (!p || p[0] !== t.you || p[1] !== t.foe) errors.push(`${id}: пара ${t.you}/${t.foe}, в 40kdc ${p?.join('/')}`);
    }
    if (t.type === 'secondary') {
      for (const [i, b] of t.blocks.entries()) {
        const want = SECONDARY_TURN[b.when];
        if (!want) errors.push(`${id}: блок ${i} — неизвестное время «${b.when}»`);
        else if (b.turn !== want) errors.push(`${id}: блок ${i} — turn ${b.turn}, по тексту «${b.when}» нужно ${want}`);
      }
    }
    if (t.drawnRequired && !t.drawn) errors.push(`${id}: drawnRequired без правила «при взятии»`);
    const d = vpDiff(t, k);
    if (d.length && allowed.get(id) !== JSON.stringify(d)) errors.push(`${id}: очки расходятся с 40kdc ${JSON.stringify(d)}`);
    out.push({ id, name: k.name, ...t });
  }
  if (errors.length) throw new Error('Карты миссий не собраны:\n' + errors.join('\n'));
  const order = { primary: 0, secondary: 1 };
  out.sort((a, b) => order[a.type] - order[b.type] || a.name.localeCompare(b.name));
  const capsSet = new Set(missions.map((m) => [m.vp_per_round_cap, m.vp_per_game_cap, m.secondary_vp_per_round_cap, m.secondary_vp_per_game_cap].join('/')));
  if (capsSet.size !== 1) throw new Error('Лимиты ПО различаются по миссиям: ' + [...capsSet].join(', '));
  const m0 = missions[0];
  return {
    schema: 'warphub-missions/1',
    source: {
      name: '40kdc-data',
      version,
      url: 'https://40kdc.alpacasoft.dev',
      license: 'CC BY 4.0 — Alpaca Software и участники 40kdc',
      deck: m0.source ?? 'Chapter Approved 2026-2027',
      text: 'Тексты карт — пересказ WarpHub на русском; сверено с картами game-datamissions.com, правилами колоды миссий и wh-rules.ru',
    },
    caps: {
      primaryRound: m0.vp_per_round_cap,
      primaryGame: m0.vp_per_game_cap,
      secondaryRound: m0.secondary_vp_per_round_cap,
      secondaryGame: m0.secondary_vp_per_game_cap,
      ...(review.caps?.fixedSecondaryCard ? { fixedSecondaryCard: review.caps.fixedSecondaryCard } : {}),
      // ПО «в конце битвы» не входят в лимит 15 за раунд (правила колоды миссий; так же считает трекер wh-rules.ru)
      ...(review.caps?.endOfBattleOutsideRoundCap ? { endOfBattleOutsideRoundCap: true } : {}),
    },
    terms: ru.terms,
    cards: out,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const version = JSON.parse(fs.readFileSync(path.join(SRC, 'tools', 'package.json'), 'utf8')).version;
  const result = buildMissions({
    cards: core('mission-cards.json'),
    missions: core('missions.json'),
    matchups: core('mission-matchups.json'),
    ru: json('missions-ru.json'),
    review: json('missions-review.json'),
    version,
  });
  fs.writeFileSync(OUT, JSON.stringify(result));
  console.log(`missions.json: ${result.cards.length} карт (${result.cards.filter((c) => c.type === 'primary').length} основных), 40kdc ${version}`);
}
