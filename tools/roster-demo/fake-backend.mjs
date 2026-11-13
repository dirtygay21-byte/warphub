/**
 * Фейковый бэкенд WarpHub для демо-сервера и UI-тестов (Playwright).
 *
 * Повторяет маршруты и формы ответов backend/src/modules/{api,admin}/index.ts и сервисов
 * booking / events / news / dnd / users. Состояние в памяти, изменения живут до перезапуска
 * или до GET /api/__reset (возвращает исходные данные). Сид детерминированный: строится от
 * текущей даты клуба (UTC+5), без Math.random.
 *
 * Картинки: /demo-img/<имя>.svg (генерируются на лету), /s3/* — заглушки для s3Url(),
 * /demo-img/uploads/* — файлы, загруженные через POST /api/admin/upload.
 */
import fs from 'node:fs';

// ---------------------------------------------------------------------------
// Конфиг (backend/src/config/booking.ts, events.ts)
// ---------------------------------------------------------------------------

const CFG = {
  tzMin: 5 * 60,
  timeZone: 'Asia/Yekaterinburg',
  openHour: 12,
  closeHourNextDay: 10,
  bookingUntilHourNextDay: 0,
  defaultDuration: 60,
  slotStep: 30,
  profile: { small: 2, large: 6 },
  clubSpectatorCapacity: 25,
  allowedWeekdays: [5, 6, 7],
  eventHours: 6,
  uploadDest: ['events', 'news', 'dnd-games'],
};

// Справочники форм записи — из настоящего конфига сервера (backend/src/config/booking.ts → bookingOptions), чтобы демо
// не отставало от приложения (13.11.2026: без games / killTeamGroups экран записей падал).
function realBookingOptions() {
  const src = fs.readFileSync(new URL('../../backend/src/config/booking.ts', import.meta.url), 'utf8');
  const from = src.indexOf('export const bookingOptions = {');
  const to = src.indexOf('} as const;', from);
  if (from < 0 || to < 0) throw new Error('fake-backend: bookingOptions не найден в backend/src/config/booking.ts');
  const body = src.slice(from + 'export const bookingOptions = '.length, to + 1).replace(/\bas const\b/g, '');
  const o = new Function(`return (${body});`)();
  const names = (dir) => {
    try {
      return JSON.parse(fs.readFileSync(new URL(`../../backend/roster-data/${dir}/index.json`, import.meta.url), 'utf8')).factions.map((f) => f.name).sort();
    } catch {
      return [];
    }
  };
  return { ...o, killTeams: o.killTeamGroups.flatMap((g) => g.factions.flatMap((f) => [...f.teams])), aosFactions: names('aos'), warcryFactions: names('warcry') };
}
const OPTIONS = realBookingOptions();

const expLabel = (v) => OPTIONS.experienceLevels.find((l) => l.value === v)?.label ?? '—';
const timeLabel = (v) => OPTIONS.dndTimePreferences.find((o) => o.value === v)?.label ?? v;
const isExp = (v) => OPTIONS.experienceLevels.some((l) => l.value === v);

// ---------------------------------------------------------------------------
// Время клуба (backend/src/modules/booking/rules.ts)
// ---------------------------------------------------------------------------

const MIN = 60_000;

function parseDateParam(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ''));
  if (!m) throw new Error('Invalid date format');
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    throw new Error('Invalid date');
  }
  return { year, month, day };
}
const addDays = (p, n) => {
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + n));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
};
const localToUtc = (p, h, m) => new Date(Date.UTC(p.year, p.month - 1, p.day, h, m) - CFG.tzMin * MIN);
const toLocalParts = (date) => {
  const s = new Date(date.getTime() + CFG.tzMin * MIN);
  return { year: s.getUTCFullYear(), month: s.getUTCMonth() + 1, day: s.getUTCDate() };
};
const isoWeekday = (p) => {
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return d === 0 ? 7 : d;
};
const pad = (n) => String(n).padStart(2, '0');
const dateKey = (p) => `${p.year}-${pad(p.month)}-${pad(p.day)}`;
function localIso(date) {
  const s = new Date(date.getTime() + CFG.tzMin * MIN);
  return `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}T${pad(s.getUTCHours())}:${pad(
    s.getUTCMinutes(),
  )}:${pad(s.getUTCSeconds())}+${pad(Math.floor(CFG.tzMin / 60))}:${pad(CFG.tzMin % 60)}`;
}
function sessionBounds(p) {
  const next = addDays(p, 1);
  return {
    openAt: localToUtc(p, CFG.openHour, 0),
    bookingUntil: localToUtc(next, CFG.bookingUntilHourNextDay, 0),
    closeAt: localToUtc(next, CFG.closeHourNextDay, 0),
  };
}
function isOnSlotGrid(startsAt, endsAt, duration) {
  const { openAt, bookingUntil, closeAt } = sessionBounds(toLocalParts(startsAt));
  const step = CFG.slotStep * MIN;
  for (let t = openAt.getTime(); t < bookingUntil.getTime(); t += step) {
    const e = t + duration * MIN;
    if (e > closeAt.getTime()) continue;
    if (t === startsAt.getTime() && e === endsAt.getTime()) return true;
  }
  return false;
}
const allowedWeekdays = (disc) => {
  const base = CFG.allowedWeekdays;
  return !disc || disc.length === 0 ? [...base] : base.filter((d) => disc.includes(d));
};
const overlaps = (a, b) => a.startsAt < b.endsAt && a.endsAt > b.startsAt;

function checkTableSession({ tableId, serviceId, startsAt, endsAt, partySize, seatsPerTable, bookings, blocks }) {
  const iv = { startsAt, endsAt };
  if (partySize > seatsPerTable) return { ok: false, reason: 'TOO_MANY' };
  if (blocks.some((b) => b.tableId === tableId && overlaps(b, iv))) return { ok: false, reason: 'BLOCKED' };
  const over = bookings.filter((b) => b.tableId === tableId && overlaps(b, iv));
  if (over.length === 0) return { ok: true, isJoin: false, others: [] };
  if (!over.every((b) => b.serviceId === serviceId && b.startsAt.getTime() === startsAt.getTime())) {
    return { ok: false, reason: 'BUSY' };
  }
  const occupied = over.reduce((s, b) => s + b.partySize, 0);
  if (occupied + partySize > seatsPerTable) return { ok: false, reason: 'FULL' };
  return { ok: true, isJoin: true, others: over };
}

function groupSessions(bookings, serviceId) {
  const map = new Map();
  for (const b of bookings) {
    if (b.serviceId !== serviceId || b.tableId === null) continue;
    const key = `${b.tableId}:${b.startsAt.getTime()}`;
    const s = map.get(key);
    if (s) {
      s.occupied += b.partySize;
      s.bookings.push(b);
      if (b.endsAt > s.endsAt) s.endsAt = b.endsAt;
    } else {
      map.set(key, { tableId: b.tableId, startsAt: b.startsAt, endsAt: b.endsAt, occupied: b.partySize, bookings: [b] });
    }
  }
  return [...map.values()].sort((a, b) => a.startsAt - b.startsAt || a.tableId - b.tableId);
}

function poolFreeSeats(iv, bookings, capacity) {
  const over = bookings.filter((b) => overlaps(b, iv));
  const points = new Set([iv.startsAt.getTime()]);
  for (const b of over) if (b.startsAt > iv.startsAt) points.add(b.startsAt.getTime());
  let max = 0;
  for (const p of points) {
    const occ = over.filter((b) => b.startsAt.getTime() <= p && b.endsAt.getTime() > p).reduce((s, b) => s + b.partySize, 0);
    max = Math.max(max, occ);
  }
  return Math.max(0, capacity - max);
}

function mergeSegments(segs) {
  const out = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (last && last.freeSeats === s.freeSeats && last.endsAt === s.startsAt) last.endsAt = s.endsAt;
    else out.push({ ...s });
  }
  return out;
}

function segmentsBy(window, intervals, freeFor) {
  if (window.startsAt >= window.endsAt) return [];
  const bounds = new Set([window.startsAt.getTime(), window.endsAt.getTime()]);
  for (const iv of intervals) {
    if (!overlaps(iv, window)) continue;
    bounds.add(Math.max(window.startsAt.getTime(), iv.startsAt.getTime()));
    bounds.add(Math.min(window.endsAt.getTime(), iv.endsAt.getTime()));
  }
  const sorted = [...bounds].sort((a, b) => a - b);
  const segs = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const startsAt = new Date(sorted[i]);
    const endsAt = new Date(sorted[i + 1]);
    if (startsAt >= endsAt) continue;
    segs.push({ startsAt: localIso(startsAt), endsAt: localIso(endsAt), freeSeats: freeFor({ startsAt, endsAt }) });
  }
  return mergeSegments(segs);
}

function bookingWindow(p, now = new Date()) {
  const { openAt, bookingUntil, closeAt } = sessionBounds(p);
  const step = CFG.slotStep * MIN;
  const nowCeil = new Date(Math.ceil(now.getTime() / step) * step);
  return { startsAt: nowCeil > openAt ? nowCeil : openAt, endsAt: bookingUntil, openAt, closeAt };
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new ApiError(status, message);
};
const invalid = (message) => fail(422, message);

function cleanText(value, field, max) {
  if (typeof value !== 'string') fail(400, `${field} is required`);
  const t = value.trim().replace(/\s+/g, ' ');
  if (!t) fail(400, `${field} is required`);
  if (t.length > max) fail(400, `${field} must be at most ${max} characters`);
  return t;
}

const WH_SLUGS = ['wh_game', 'wh_group_training', 'wh_solo_training'];
const detailsKind = (slug) => (WH_SLUGS.includes(slug) ? 'wh_player' : slug === 'wh_painting' ? 'painting' : null);

function validateDetails(kind, raw) {
  if (kind === null) {
    if (raw !== undefined && raw !== null) fail(400, 'details are not supported for this service');
    return null;
  }
  if (typeof raw !== 'object' || raw === null) fail(400, 'details are required for this service');
  if (kind === 'wh_player') {
    const points = Number(raw.points);
    if (!Number.isInteger(points) || points < 1 || points > OPTIONS.maxPoints) {
      fail(400, `points must be a whole number from 1 to ${OPTIONS.maxPoints}`);
    }
    if (!isExp(raw.experienceLevel)) fail(400, 'experienceLevel is invalid');
    return { kind, army: cleanText(raw.army, 'army', 80), points, experienceLevel: raw.experienceLevel };
  }
  if (!OPTIONS.paintSources.some((s) => s.value === raw.paintSource)) fail(400, 'paintSource is invalid');
  if (typeof raw.needsHelp !== 'boolean') fail(400, 'needsHelp must be true or false');
  const comment = raw.comment === undefined || raw.comment === null || raw.comment === '' ? null : cleanText(raw.comment, 'comment', 500);
  return {
    kind,
    faction: cleanText(raw.faction, 'faction', 80),
    model: cleanText(raw.model, 'model', 120),
    paintSource: raw.paintSource,
    needsHelp: raw.needsHelp,
    comment,
  };
}

// ---------------------------------------------------------------------------
// Картинки-заглушки
// ---------------------------------------------------------------------------

const IMAGES = {
  'event-autumn-cup': ['Осенний кубок', 'Warhammer 40,000 · турнир', 200],
  'event-paint-night': ['Вечер покраски', 'мастер-класс', 320],
  'event-summer-league': ['Летняя лига', 'итоги сезона', 30],
  'news-cup': ['Осенний кубок', 'регистрация открыта', 200],
  'news-terrain': ['Новый террейн', 'два стола обновлены', 140],
  'news-painting': ['Мастер-класс', 'покраска миниатюр', 320],
  'news-dnd': ['D&D по будням', 'новая кампания', 270],
  'news-hours': ['Клуб открыт', 'до 10 утра', 180],
  'news-killteam': ['Kill Team', 'лига стартует', 0],
  'dnd-strahd': ['Проклятие Страда', 'кампания', 290],
  'dnd-goblins': ['Логово гоблинов', 'one-shot', 100],
  'dnd-trial': ['Пробная игра', 'для новичков', 160],
  'dnd-phandelver': ['Фанделвер', 'кампания', 40],
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function placeholderSvg(name) {
  const key = name.replace(/\.[a-z0-9]+$/i, '');
  let [title, subtitle, hue] = IMAGES[key] ?? [key.split('/').pop().replace(/[_-]+/g, ' '), 'WarpHub', null];
  if (hue === null) {
    hue = 0;
    for (const ch of key) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
  }
  const small = /^(disciplines|services|logo)/.test(key.replace(/^.*?(disciplines|services|logo)/, '$1'));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},55%,32%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},60%,12%)"/></linearGradient></defs>
<rect width="1200" height="720" fill="url(#g)"/>
<g fill="none" stroke="rgba(234,255,68,.25)" stroke-width="3"><circle cx="980" cy="160" r="120"/><circle cx="980" cy="160" r="70"/><path d="M0 600 L1200 420"/></g>
<text x="80" y="${small ? 420 : 380}" font-family="system-ui,sans-serif" font-size="${small ? 150 : 96}" font-weight="700" fill="#fff">${esc(small ? title.slice(0, 2).toUpperCase() : title)}</text>
${small ? '' : `<text x="80" y="460" font-family="system-ui,sans-serif" font-size="44" fill="#eaff44">${esc(subtitle)}</text>`}
</svg>`;
}

// ---------------------------------------------------------------------------
// Сид
// ---------------------------------------------------------------------------

const EXTRA_USERS = [
  { id: 'u-dmitry', telegramId: 4004, firstName: 'Дмитрий', lastName: 'Волков', username: 'volk_40k', photoUrl: '' },
  { id: 'u-olga', telegramId: 5005, firstName: 'Ольга', lastName: 'Кузнецова', username: 'olga_paints', photoUrl: '' },
  { id: 'u-sergey', telegramId: 6006, firstName: 'Сергей', lastName: 'Морозов', username: 'morozov_sm', photoUrl: '' },
  { id: 'u-maria', telegramId: 7007, firstName: 'Мария', lastName: 'Лебедева', username: null, photoUrl: '' },
  { id: 'u-artem', telegramId: 8008, firstName: 'Артём', lastName: 'Новиков', username: 'artem_n', photoUrl: '' },
];

const uuid = (prefix, n) => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;

function buildSeed(demoUsers, now = new Date()) {
  const byTg = (tg) => [...demoUsers, ...EXTRA_USERS].find((u) => u.telegramId === tg).id;
  const U = {
    egor: byTg(1001), ivan: byTg(2002), anna: byTg(3003),
    dmitry: 'u-dmitry', olga: 'u-olga', sergey: 'u-sergey', maria: 'u-maria', artem: 'u-artem',
  };
  const today = toLocalParts(now);
  const isAllowed = (p) => CFG.allowedWeekdays.includes(isoWeekday(p));
  const future = [];
  for (let i = 1; future.length < 6; i++) if (isAllowed(addDays(today, i))) future.push(addDays(today, i));
  const past = [];
  for (let i = 1; past.length < 2; i++) if (isAllowed(addDays(today, -i))) past.push(addDays(today, -i));
  const weekdayAfter = (wd, minOffset = 1) => {
    for (let i = minOffset; ; i++) if (isoWeekday(addDays(today, i)) === wd) return addDays(today, i);
  };
  const at = (p, hm) => localToUtc(p, Number(hm.slice(0, 2)), Number(hm.slice(3)));
  const ago = (h) => new Date(now.getTime() - h * 3600e3);
  const [D1, D2, D3, D4, D5] = future;
  const [P1, P2] = past;

  const disciplines = [
    { id: 1, slug: 'wh', title: 'Warhammer 40,000', isActive: true, sortOrder: 1, scheduleWeekdays: [5, 6, 7] },
    { id: 2, slug: 'dnd', title: 'D&D', isActive: true, sortOrder: 2, scheduleWeekdays: [1, 2, 3, 4] },
    { id: 3, slug: 'club', title: 'Посещение клуба', isActive: true, sortOrder: 3, scheduleWeekdays: [5, 6, 7] },
  ];
  const svc = (o) => ({
    tableCapacityProfile: null, duration: null, visitorsCapacity: null, seatsPerTable: null, poolCapacity: null,
    hasTrainer: false, isActive: true, sortOrder: 0, description: null, ...o,
  });
  const services = [
    svc({ id: 1, disciplineId: 3, slug: 'club_visit', title: 'Посещение клуба', duration: 180, poolCapacity: 25, visitorsCapacity: 10, sortOrder: 1,
      description: 'Приходите поиграть в настолки, посмотреть игры или просто пообщаться. До 25 гостей одновременно.' }),
    svc({ id: 2, disciplineId: 1, slug: 'wh_game', title: 'Игра Warhammer', tableCapacityProfile: 'small', duration: 180, seatsPerTable: 2, sortOrder: 1,
      description: 'Стол 2 игрока на 3 часа. Можно занять пустой стол или присоединиться к игроку, который ищет соперника.' }),
    svc({ id: 3, disciplineId: 1, slug: 'wh_group_training', title: 'Групповая тренировка', tableCapacityProfile: 'small', duration: 120, seatsPerTable: 2, hasTrainer: true, sortOrder: 2,
      description: 'Двое игроков и тренер клуба: разбор правил, тактики и ростеров.' }),
    svc({ id: 4, disciplineId: 1, slug: 'wh_solo_training', title: 'Индивидуальная тренировка', tableCapacityProfile: 'small', duration: 90, seatsPerTable: 1, hasTrainer: true, sortOrder: 3,
      description: 'Один на один с тренером: подготовка к турниру или первые шаги в игре.' }),
    svc({ id: 5, disciplineId: 2, slug: 'dnd_game', title: 'Стол D&D', tableCapacityProfile: 'large', duration: 240, isActive: false, sortOrder: 1,
      description: 'Запись на стол D&D заменена играми и заявками.' }),
    svc({ id: 6, disciplineId: 1, slug: 'wh_painting', title: 'Покраска миниатюр', duration: 120, poolCapacity: 5, visitorsCapacity: 5, sortOrder: 4,
      description: 'Место за покрасочным столом на 2 часа. Свои краски или краски клуба, поможем с техникой.' }),
  ];
  const tables = [
    { id: 1, name: 'Стол 1', isActive: true },
    { id: 2, name: 'Стол 2', isActive: true },
    { id: 3, name: 'Стол 3', isActive: false },
  ];

  let rn = 0;
  const reservations = [];
  const dur = (sid) => services.find((s) => s.id === sid).duration;
  const wh = (army, points, experienceLevel) => ({ kind: 'wh_player', army, points, experienceLevel });
  const paint = (faction, model, paintSource, needsHelp, comment = null) => ({ kind: 'painting', faction, model, paintSource, needsHelp, comment });
  const R = (userId, serviceId, day, hm, { table = null, party = 1, details = null, status = 'confirmed', clubArmy = false, createdH = 72 } = {}) => {
    const startsAt = at(day, hm);
    const isWh = [2, 3, 4].includes(serviceId);
    const cancelled = status === 'cancelled';
    reservations.push({
      id: uuid('a0000000', ++rn), userId, serviceId, tableId: table, partySize: party,
      seatClubArmyOptions: isWh ? [clubArmy] : null, buyArmyOptions: null, details,
      startsAt, endsAt: new Date(startsAt.getTime() + dur(serviceId) * MIN), status,
      cancelledAt: cancelled ? ago(createdH / 2) : null, createdAt: ago(createdH),
    });
  };

  // D1: открытая игра «ищут соперника», полная игра, тренировки, покраска частично занята, клуб
  R(U.dmitry, 2, D1, '14:00', { table: 1, details: wh('Necrons', 1000, 'experienced'), createdH: 50 });
  R(U.egor, 2, D1, '18:00', { table: 1, details: wh('Space Marines', 2000, 'veteran'), createdH: 49 });
  R(U.sergey, 2, D1, '18:00', { table: 1, details: wh('Orks', 2000, 'player'), clubArmy: true, createdH: 30 });
  R(U.anna, 3, D1, '13:00', { table: 2, details: wh('Tyranids', 500, 'beginner'), status: 'pending', clubArmy: true, createdH: 20 });
  R(U.artem, 4, D1, '17:00', { table: 2, details: wh('Aeldari', 1000, 'player'), createdH: 26 });
  R(U.olga, 6, D1, '15:00', { party: 2, details: paint('Adeptus Mechanicus', 'Skitarii Rangers', 'club', true, 'Хочу научиться делать ржавчину'), createdH: 40 });
  R(U.maria, 6, D1, '15:30', { party: 2, details: paint('Death Guard', 'Plague Marines', 'own', false), status: 'pending', createdH: 10 });
  R(U.egor, 6, D1, '19:00', { details: paint('Blood Angels', 'Sanguinary Guard', 'own', false), status: 'pending', createdH: 8 });
  R(U.sergey, 1, D1, '16:00', { party: 4, createdH: 33 });
  R(U.ivan, 1, D1, '20:00', { party: 20, status: 'pending', createdH: 5 });
  // D2
  R(U.ivan, 2, D2, '15:00', { table: 2, details: wh('Death Guard', 1000, 'player'), status: 'pending', createdH: 12 });
  R(U.artem, 2, D2, '19:00', { table: 1, details: wh("T'au Empire", 1500, 'experienced'), createdH: 14 });
  R(U.anna, 6, D2, '14:00', { party: 5, details: paint('Tyranids', 'Termagants', 'club', false), createdH: 60 });
  R(U.maria, 1, D2, '13:00', { party: 2, createdH: 22 });
  R(U.egor, 3, D2, '12:00', { table: 1, details: wh('Space Marines', 1000, 'player'), status: 'pending', createdH: 6 });
  // D3
  R(U.olga, 2, D3, '16:00', { table: 1, details: wh('Adeptus Custodes', 1000, 'player'), status: 'pending', createdH: 4 });
  R(U.ivan, 2, D3, '18:00', { table: 2, details: wh('Death Guard', 1500, 'player'), status: 'cancelled', createdH: 30 });
  R(U.dmitry, 6, D3, '13:00', { details: paint('Necrons', 'Canoptek Wraiths', 'own', false), status: 'cancelled', createdH: 28 });
  // Прошедшие
  R(U.egor, 2, P1, '15:00', { table: 1, details: wh('Space Marines', 1500, 'experienced'), createdH: 24 * 6 });
  R(U.dmitry, 2, P1, '15:00', { table: 1, details: wh('Necrons', 1500, 'experienced'), createdH: 24 * 5 });
  R(U.egor, 6, P1, '14:00', { details: paint('Blood Angels', 'Death Company', 'club', true), status: 'cancelled', createdH: 24 * 7 });
  R(U.anna, 1, P1, '18:00', { party: 3, createdH: 24 * 4 });
  R(U.sergey, 4, P1, '13:00', { table: 2, details: wh('Orks', 1000, 'player'), createdH: 24 * 6 });
  R(U.ivan, 2, P2, '17:00', { table: 2, details: wh('Death Guard', 1000, 'beginner'), createdH: 24 * 9 });
  R(U.artem, 2, P2, '17:00', { table: 2, details: wh("T'au Empire", 1000, 'player'), createdH: 24 * 8 });
  R(U.olga, 6, P2, '16:00', { details: paint('Adeptus Mechanicus', 'Tech-Priest Dominus', 'own', false), createdH: 24 * 10 });
  R(U.maria, 3, P2, '14:00', { table: 1, details: wh('Death Guard', 500, 'beginner'), status: 'pending', createdH: 24 * 11 });

  // Ивенты (столы ивента блокируют запись за столом)
  const ev = (id, title, description, day, from, hours, seatsPerTable, tableIds, banner, createdH) => ({
    id, title, description, startsAt: at(day, from), endsAt: new Date(at(day, from).getTime() + hours * 3600e3),
    seatsPerTable, tableIds, bannerUrl: `/demo-img/${banner}.svg`, createdAt: ago(createdH), updatedAt: ago(createdH),
  });
  const events = [
    ev(1, 'Летняя лига: финал', 'Финальные игры летнего сезона.', addDays(P2, -14), '12:00', 6, 4, [1, 2], 'event-summer-league', 24 * 40),
    ev(2, 'Осенний кубок Warhammer 40,000', 'Турнир на 2000 очков, 3 тура. Ростеры — до вечера пятницы. Призы от клуба, судья на месте.',
      D4, '12:00', 6, 4, [1, 2], 'event-autumn-cup', 24 * 5),
    ev(3, 'Вечер покраски с мастером', 'Разбираем подшёрстку, сухую кисть и базы. Краски клуба — бесплатно.', D5, '13:00', 4, 6, [1], 'event-paint-night', 24 * 2),
  ];
  const registrations = [
    { eventId: 2, userId: U.egor, partySize: 2, createdAt: ago(48) },
    { eventId: 2, userId: U.anna, partySize: 1, createdAt: ago(40) },
    { eventId: 2, userId: U.sergey, partySize: 2, createdAt: ago(30) },
    { eventId: 3, userId: U.olga, partySize: 2, createdAt: ago(20) },
    { eventId: 1, userId: U.egor, partySize: 1, createdAt: ago(24 * 30) },
  ];

  const n = (id, title, text, cover, publishedH) => ({
    id, title, text, coverUrl: `/demo-img/${cover}.svg`,
    publishedAt: ago(publishedH), createdAt: ago(Math.max(publishedH, 1) + 2), updatedAt: ago(Math.max(publishedH, 1) + 1),
  });
  const news = [
    n(1, 'Открыта регистрация на Осенний кубок',
      'Осенний кубок Warhammer 40,000 пройдёт в клубе уже скоро. Формат — 2000 очков, три тура, ростеры принимаем до вечера пятницы.\n\nЗаписаться можно прямо в приложении: главная → «Ближайший ивент». Мест немного — два стола по четыре игрока.',
      'news-cup', 20),
    n(2, 'Новый террейн на обоих столах',
      'Мы обновили террейн: руины в стиле Некромунды, баррикады и пара больших строений для линий обзора.\n\nПриходите опробовать — первые игры на новом столе бесплатно для участников клуба.',
      'news-terrain', 24 * 4),
    n(3, 'Мастер-класс по покраске',
      'В субботу проводим мастер-класс: подшёрстка, сухая кисть и оформление подставок.\n\nКраски клуба — бесплатно, свои модели приветствуются. Запись через «Покраску миниатюр».',
      'news-painting', 24 * 8),
    n(4, 'D&D по будням: стартует новая кампания',
      'С понедельника по четверг в клубе играем в D&D. Новичкам — пробные игры, опытным — кампания «Проклятие Страда».\n\nНе нашли подходящую дату? Оставьте заявку «Хочу попробовать», и мы соберём группу.',
      'news-dnd', 24 * 12),
    n(5, 'Клуб открыт до 10 утра',
      'В пятницу, субботу и воскресенье клуб работает с 12:00 и до 10:00 следующего дня. Записаться на игру можно до полуночи.',
      'news-hours', 24 * 20),
    n(6, 'Анонс: лига Kill Team',
      'Черновик: лига Kill Team стартует в следующем месяце. Подробности позже.', 'news-killteam', -72),
  ];

  const g = (id, title, description, gameType, day, from, hours, capacity, status, image, createdH) => {
    const startsAt = at(day, from);
    return {
      id, title, description, gameType, startsAt, endsAt: hours ? new Date(startsAt.getTime() + hours * 3600e3) : null,
      capacity, status, imageUrl: image ? `/demo-img/${image}.svg` : null, createdAt: ago(createdH), updatedAt: ago(createdH),
    };
  };
  const dndGames = [
    g(1, 'Проклятие Страда: пролог', 'Готический хоррор в землях Баровии. Первая сессия кампании, персонажи 1 уровня — поможем собрать.',
      'Кампания', weekdayAfter(2), '19:00', 4, 5, 'open', 'dnd-strahd', 24 * 6),
    g(2, 'Логово гоблинов', 'Короткое приключение на один вечер: пещеры, ловушки и гоблинский вождь.', 'One-shot',
      weekdayAfter(3), '18:30', 4, 4, 'open', 'dnd-goblins', 24 * 5),
    g(3, 'Пробная игра для новичков', 'Расскажем правила за 15 минут, выдадим готовых персонажей и кубики. Подходит тем, кто ни разу не играл.',
      'Пробная игра', weekdayAfter(4), '19:00', 3, 6, 'open', 'dnd-trial', 24 * 3),
    g(4, 'Затерянная шахта Фанделвера', 'Классическая стартовая кампания. Запись временно закрыта — собираем группу из заявок.',
      'Кампания', weekdayAfter(2, 8), '19:00', 4, 5, 'closed', 'dnd-phandelver', 24 * 2),
    g(5, 'Хэллоуинский ваншот', null, 'One-shot', weekdayAfter(4, 15), '20:00', null, 6, 'draft', null, 12),
    g(6, 'Пробная игра: Таверна «Пьяный дракон»', 'Прошедшая пробная игра.', 'Пробная игра', weekdayAfter(3, -13), '19:00', 3, 6, 'open', 'dnd-trial', 24 * 20),
  ];
  let bn = 0;
  const B = (gameId, userId, quantity, experienceLevel, timeIsConvenient = true, status = 'active', createdH = 24) => ({
    id: uuid('b0000000', ++bn), gameId, userId, quantity, timeIsConvenient, experienceLevel, status,
    createdAt: ago(createdH), cancelledAt: status === 'cancelled' ? ago(createdH / 2) : null,
  });
  const dndBookings = [
    B(1, U.egor, 1, 'player', true, 'active', 48),
    B(1, U.sergey, 2, 'experienced', true, 'active', 40),
    B(2, U.ivan, 2, 'beginner', true, 'active', 30),
    B(2, U.maria, 2, 'player', false, 'active', 25),
    B(3, U.anna, 1, 'beginner', true, 'active', 10),
    B(3, U.artem, 1, 'beginner', true, 'cancelled', 9),
    B(6, U.egor, 1, 'beginner', true, 'active', 24 * 16),
  ];
  let tn = 0;
  const T = (userId, playersCount, preferredTimes, experienceLevel, isPrivate, notes, status, gameId, createdH) => ({
    id: uuid('c0000000', ++tn), userId, playersCount, preferredTimes, experienceLevel, isPrivate, notes, status, gameId,
    createdAt: ago(createdH), updatedAt: ago(createdH),
  });
  const trialRequests = [
    T(U.ivan, 2, ['evening'], 'beginner', false, 'С другом, оба впервые', 'new', null, 30),
    T(U.olga, 4, ['afternoon', 'evening'], null, true, 'Своей компанией, хотим отдельную игру', 'new', null, 18),
    T(U.maria, 1, ['evening'], 'beginner', false, null, 'grouped', 3, 24 * 3),
    T(U.artem, 1, ['morning'], 'player', false, null, 'cancelled', null, 24 * 6),
  ];

  return {
    disciplines, services, tables, reservations, events, registrations, news, dndGames, dndBookings, trialRequests,
    uploads: new Map(), seq: { rn, bn, tn, event: 3, news: 6, game: 6, upload: 0 },
  };
}

// ---------------------------------------------------------------------------
// Бэкенд
// ---------------------------------------------------------------------------

export function createFakeBackend({ users }) {
  let S;
  const reset = () => {
    S = buildSeed(users);
  };
  reset();

  const allUsers = () => [...users, ...EXTRA_USERS];
  const userById = (id) => allUsers().find((u) => u.id === id);
  const service = (id) => S.services.find((s) => s.id === Number(id));
  const discipline = (id) => S.disciplines.find((d) => d.id === id);
  const activeTables = () => S.tables.filter((t) => t.isActive).sort((a, b) => a.id - b.id);
  const isActiveRes = (r) => r.status === 'pending' || r.status === 'confirmed';
  const iso = (d) => (d ? d.toISOString() : null);

  function resolveMode(s) {
    if (s.poolCapacity !== null || s.slug === 'club_visit') return { mode: 'pool', capacity: s.poolCapacity ?? CFG.clubSpectatorCapacity };
    if (s.seatsPerTable !== null || s.tableCapacityProfile !== null) {
      return { mode: 'table', seatsPerTable: s.seatsPerTable ?? CFG.profile[s.tableCapacityProfile] };
    }
    return { mode: 'none' };
  }
  const duration = (s) => s.duration ?? CFG.defaultDuration;

  const tableBookings = (tableIds, from, to) =>
    S.reservations.filter((r) => r.tableId !== null && tableIds.includes(r.tableId) && isActiveRes(r) && r.startsAt < to && r.endsAt > from);
  const poolBookings = (serviceId, from, to) =>
    S.reservations.filter((r) => r.serviceId === serviceId && r.tableId === null && isActiveRes(r) && r.startsAt < to && r.endsAt > from);
  const eventBlocks = (tableIds, from, to) =>
    S.events
      .filter((e) => e.startsAt < to && e.endsAt > from)
      .flatMap((e) => e.tableIds.filter((t) => tableIds.includes(t)).map((tableId) => ({ tableId, startsAt: e.startsAt, endsAt: e.endsAt, eventId: e.id })));

  // ---------- Услуги и доступность ----------

  function availability(serviceId, date) {
    const s = service(serviceId);
    if (!s || !s.isActive) return null;
    const p = parseDateParam(date);
    const disc = discipline(s.disciplineId);
    const mode = resolveMode(s);
    const allowed = allowedWeekdays(disc?.scheduleWeekdays);
    const dateAllowed = allowed.includes(isoWeekday(p));
    const base = {
      date, dateAllowed, allowedWeekdays: allowed,
      service: {
        id: s.id, slug: s.slug, duration: duration(s), visitorsCapacity: s.visitorsCapacity, tableCapacityProfile: s.tableCapacityProfile,
        mode: mode.mode, seatsPerTable: mode.mode === 'table' ? mode.seatsPerTable : null,
        poolCapacity: mode.mode === 'pool' ? mode.capacity : null, hasTrainer: s.hasTrainer,
        ...(s.slug === 'club_visit' && mode.mode === 'pool' ? { clubSpectatorCapacity: mode.capacity } : {}),
      },
      slots: [], sessions: [],
    };
    if (!dateAllowed || mode.mode === 'none') return base;
    const win = bookingWindow(p);
    if (mode.mode === 'pool') {
      const bookings = poolBookings(s.id, win.openAt, win.closeAt);
      base.slots = [{
        table: { id: 0, name: s.slug === 'club_visit' ? 'Клуб' : (s.title ?? 'Места'), seatCapacity: mode.capacity },
        segments: segmentsBy(win, bookings, (iv) =>
          Math.max(0, mode.capacity - bookings.filter((b) => overlaps(b, iv)).reduce((sum, b) => sum + b.partySize, 0))),
      }];
      return base;
    }
    const tables = activeTables();
    const ids = tables.map((t) => t.id);
    const bookings = tableBookings(ids, win.openAt, win.closeAt);
    const blocks = eventBlocks(ids, win.openAt, win.closeAt);
    base.slots = tables.map((t) => {
      const busy = [...bookings.filter((b) => b.tableId === t.id), ...blocks.filter((b) => b.tableId === t.id)];
      return {
        table: { id: t.id, name: t.name, seatCapacity: mode.seatsPerTable },
        segments: segmentsBy(win, busy, (iv) => (busy.some((b) => overlaps(b, iv)) ? 0 : mode.seatsPerTable)),
      };
    });
    const now = new Date();
    base.sessions = groupSessions(bookings, s.id)
      .filter((x) => x.startsAt > now)
      .map((x) => ({
        tableId: x.tableId, tableName: tables.find((t) => t.id === x.tableId)?.name ?? '',
        startsAt: localIso(x.startsAt), endsAt: localIso(x.endsAt), occupied: x.occupied, capacity: mode.seatsPerTable,
        freeSeats: Math.max(0, mode.seatsPerTable - x.occupied),
        players: x.bookings.map((b) => {
          const d = b.details;
          const first = userById(b.userId)?.firstName ?? 'Игрок';
          return d?.kind === 'wh_player'
            ? { firstName: first, army: d.army, points: d.points, experienceLevel: d.experienceLevel, experienceLabel: expLabel(d.experienceLevel) }
            : { firstName: first, army: null, points: null, experienceLevel: null, experienceLabel: null };
        }),
      }));
    return base;
  }

  // ---------- Записи ----------

  const toResponse = (r) => ({
    id: r.id, serviceId: r.serviceId, tableId: r.tableId, partySize: r.partySize, seatClubArmyOptions: r.seatClubArmyOptions,
    buyArmyOptions: r.buyArmyOptions, details: r.details ?? null, startsAt: iso(r.startsAt), endsAt: iso(r.endsAt), status: r.status,
  });
  const toView = (r) => {
    const s = service(r.serviceId);
    const u = userById(r.userId);
    return {
      id: r.id, userId: r.userId, serviceId: r.serviceId, serviceSlug: s.slug, serviceTitle: s.title, tableId: r.tableId,
      tableName: S.tables.find((t) => t.id === r.tableId)?.name ?? null, partySize: r.partySize,
      seatClubArmyOptions: r.seatClubArmyOptions, buyArmyOptions: r.buyArmyOptions, details: r.details ?? null,
      startsAt: iso(r.startsAt), endsAt: iso(r.endsAt), status: r.status, cancelledAt: iso(r.cancelledAt), createdAt: iso(r.createdAt),
      user: { telegramId: u.telegramId, firstName: u.firstName, lastName: u.lastName || null, username: u.username || null },
    };
  };

  function filterReservations(q) {
    let list = S.reservations;
    if (q.serviceId !== undefined) list = list.filter((r) => r.serviceId === q.serviceId);
    if (q.tableId !== undefined) list = list.filter((r) => r.tableId === q.tableId);
    if (q.status !== undefined) list = list.filter((r) => r.status === q.status);
    if (q.userId !== undefined) list = list.filter((r) => r.userId === q.userId);
    if (q.date !== undefined) {
      const { openAt, closeAt } = sessionBounds(parseDateParam(q.date));
      list = list.filter((r) => r.startsAt < closeAt && r.endsAt > openAt);
    }
    if (q.startsAt !== undefined) list = list.filter((r) => r.startsAt >= parseIso(q.startsAt));
    if (q.endsAt !== undefined) list = list.filter((r) => r.endsAt <= parseIso(q.endsAt));
    return list;
  }
  function listReservations(q = {}) {
    const by = q.sortBy ?? 'startsAt';
    const dir = (q.sortOrder ?? 'desc') === 'asc' ? 1 : -1;
    const key = (r) => (by === 'createdAt' ? r.createdAt.getTime() : by === 'status' ? r.status : r.startsAt.getTime());
    const limit = Math.min(Math.max(q.limit ?? 50, 1), 100);
    const offset = Math.max(q.offset ?? 0, 0);
    return [...filterReservations(q)]
      .sort((a, b) => (key(a) < key(b) ? -dir : key(a) > key(b) ? dir : 0))
      .slice(offset, offset + limit)
      .map(toView);
  }

  function parseIso(v) {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) fail(400, 'Invalid startsAt datetime');
    return d;
  }

  function createReservation(user, body) {
    const s = service(body.serviceId);
    const disc = s && discipline(s.disciplineId);
    if (!s || !s.isActive || disc?.isActive === false) fail(404, 'Service not found');
    const mode = resolveMode(s);
    if (mode.mode === 'none') fail(400, 'This service cannot be booked online');
    if (body.startsAt === undefined) fail(400, 'startsAt is required for this service');
    const startsAt = parseIso(body.startsAt);
    const endsAt = new Date(startsAt.getTime() + duration(s) * MIN);
    if (startsAt.getTime() <= Date.now()) fail(400, 'Selected time is in the past');
    if (!isOnSlotGrid(startsAt, endsAt, duration(s))) fail(400, 'Selected time slot is not available');
    const p = toLocalParts(startsAt);
    if (!allowedWeekdays(disc?.scheduleWeekdays).includes(isoWeekday(p))) {
      fail(400, 'This activity can only be booked on Friday, Saturday or Sunday');
    }
    const details = validateDetails(detailsKind(s.slug), body.details);
    const partySize = body.partySize ?? 1;
    if (!Number.isInteger(partySize) || partySize <= 0) fail(400, 'partySize must be greater than 0');
    if (detailsKind(s.slug) === 'wh_player' && partySize !== 1) fail(400, 'Each Warhammer player books one place');

    let seatClubArmyOptions = null;
    if (WH_SLUGS.includes(s.slug)) {
      if (body.seatClubArmyOptions === undefined) seatClubArmyOptions = Array.from({ length: partySize }, () => false);
      else if (body.seatClubArmyOptions.length !== partySize) fail(400, `seatClubArmyOptions must contain exactly ${partySize} boolean values`);
      else seatClubArmyOptions = body.seatClubArmyOptions;
    } else if (body.seatClubArmyOptions?.length > 0) {
      fail(400, 'seatClubArmyOptions is only allowed for Warhammer game/training services');
    }
    let buyArmyOptions = null;
    if (s.slug === 'wh_painting') {
      if (body.buyArmyOptions?.length > 0) {
        if (body.buyArmyOptions.length !== partySize) fail(400, `buyArmyOptions must contain exactly ${partySize} boolean values`);
        buyArmyOptions = body.buyArmyOptions;
      }
    } else if (body.buyArmyOptions?.length > 0) fail(400, 'buyArmyOptions is only allowed for wh_painting');

    const { openAt, closeAt } = sessionBounds(p);
    const make = (tableId) => ({
      id: uuid('a0000000', ++S.seq.rn), userId: user.id, serviceId: s.id, tableId, partySize, seatClubArmyOptions, buyArmyOptions,
      details, startsAt, endsAt, status: 'pending', cancelledAt: null, createdAt: new Date(),
    });

    if (mode.mode === 'pool') {
      if (body.tableId !== undefined) fail(400, 'This activity does not use a table');
      const maxParty = Math.min(s.visitorsCapacity ?? mode.capacity, mode.capacity);
      if (partySize > maxParty) fail(400, `partySize cannot exceed ${maxParty}`);
      const free = poolFreeSeats({ startsAt, endsAt }, poolBookings(s.id, openAt, closeAt), mode.capacity);
      if (free < partySize) fail(409, free === 0 ? 'No places left' : `Only ${free} places left`);
      const r = make(null);
      S.reservations.push(r);
      log(`＋ ${who(user)} записался: ${s.title}, ${localIso(startsAt)}, мест ${partySize}`);
      return { ...toResponse(r), joinedSession: false };
    }

    if (body.tableId === undefined) fail(400, 'tableId is required for this service');
    const tableId = body.tableId;
    if (!S.tables.some((t) => t.id === tableId && t.isActive)) fail(400, 'Table not found');
    const bookings = tableBookings([tableId], openAt, closeAt);
    const check = checkTableSession({
      tableId, serviceId: s.id, startsAt, endsAt, partySize, seatsPerTable: mode.seatsPerTable,
      bookings, blocks: eventBlocks([tableId], openAt, closeAt),
    });
    if (!check.ok) {
      const msg = {
        BLOCKED: 'The table is reserved for an event at this time', BUSY: 'The table is already taken at this time',
        FULL: 'This game is already full', TOO_MANY: `partySize cannot exceed ${mode.seatsPerTable}`,
      }[check.reason];
      fail(check.reason === 'TOO_MANY' ? 400 : 409, msg);
    }
    if (check.isJoin && bookings.some((b) => b.userId === user.id && b.startsAt.getTime() === startsAt.getTime())) {
      fail(409, 'You are already booked for this game');
    }
    const r = make(tableId);
    S.reservations.push(r);
    log(`＋ ${who(user)} ${check.isJoin ? 'присоединился к игре' : 'занял стол'}: ${s.title}, стол ${tableId}, ${localIso(startsAt)}`);
    return { ...toResponse(r), joinedSession: check.isJoin };
  }

  const findRes = (id) => S.reservations.find((r) => r.id === id) ?? fail(404, 'Reservation not found');

  // ---------- Ивенты ----------

  const eventView = (e) => ({
    id: e.id, title: e.title, description: e.description ?? null, startsAt: iso(e.startsAt), endsAt: iso(e.endsAt),
    seatsPerTable: e.seatsPerTable, capacity: e.tableIds.length * e.seatsPerTable, bannerUrl: e.bannerUrl ?? null,
    tableIds: [...e.tableIds], createdAt: iso(e.createdAt), updatedAt: iso(e.updatedAt),
  });
  const registeredSeats = (id) => S.registrations.filter((r) => r.eventId === id).reduce((s, r) => s + r.partySize, 0);
  const publicEventView = (e) => {
    const v = eventView(e);
    const registeredCount = registeredSeats(e.id);
    return { ...v, registeredCount, freeSeats: Math.max(0, v.capacity - registeredCount) };
  };
  const nearestEvent = () => S.events.filter((e) => e.startsAt > new Date()).sort((a, b) => a.startsAt - b.startsAt)[0];
  const findEvent = (id) => S.events.find((e) => e.id === Number(id)) ?? fail(404, 'Event not found');

  function assertTablesFree(tableIds, startsAt, endsAt, excludeEventId) {
    if (tableIds.some((id) => !S.tables.some((t) => t.id === id))) fail(400, 'One or more tables are invalid');
    if (tableBookings(tableIds, startsAt, endsAt).length > 0) fail(409, 'One or more tables are already booked for this time');
    if (eventBlocks(tableIds, startsAt, endsAt).some((b) => b.eventId !== excludeEventId)) {
      fail(409, 'One or more tables are reserved for another event at this time');
    }
  }

  function upsertEvent(existing, body) {
    // Как на бэкенде: admin/index.ts не передаёт description в createEvent/updateEvent
    if (!existing && (typeof body.title !== 'string' || !body.title || typeof body.startsAt !== 'string' || !(body.seatsPerTable >= 1))) {
      invalid('title, startsAt and seatsPerTable are required');
    }
    const startsAt = body.startsAt !== undefined ? parseIso(body.startsAt) : existing.startsAt;
    const endsAt = body.endsAt !== undefined ? parseIso(body.endsAt)
      : existing && body.startsAt === undefined ? existing.endsAt : new Date(startsAt.getTime() + CFG.eventHours * 3600e3);
    if (endsAt <= startsAt) fail(400, 'endsAt must be after startsAt');
    const seatsPerTable = body.seatsPerTable ?? existing?.seatsPerTable;
    if (!(seatsPerTable > 0)) fail(400, 'seatsPerTable must be greater than 0');
    const tableIds = body.tableIds !== undefined ? [...new Set(body.tableIds)] : existing?.tableIds ?? [];
    if (tableIds.length === 0) fail(400, 'At least one table is required for an event');
    assertTablesFree(tableIds, startsAt, endsAt, existing?.id);
    if (existing && registeredSeats(existing.id) > tableIds.length * seatsPerTable) {
      fail(400, 'Event capacity cannot be less than current registrations');
    }
    const e = existing ?? { id: ++S.seq.event, description: null, createdAt: new Date() };
    Object.assign(e, {
      title: body.title ?? e.title, startsAt, endsAt, seatsPerTable, tableIds,
      bannerUrl: body.bannerUrl !== undefined ? body.bannerUrl : e.bannerUrl ?? null, updatedAt: new Date(),
    });
    if (!existing) S.events.push(e);
    return eventView(e);
  }

  function emptyTables(q) {
    const startsAt = parseIso(q.startsAt);
    const endsAt = q.endsAt !== undefined ? parseIso(q.endsAt) : new Date(startsAt.getTime() + CFG.eventHours * 3600e3);
    if (endsAt <= startsAt) fail(400, 'endsAt must be after startsAt');
    const ids = activeTables().map((t) => t.id);
    const busy = new Set([
      ...tableBookings(ids, startsAt, endsAt).map((r) => r.tableId),
      ...eventBlocks(ids, startsAt, endsAt).filter((b) => b.eventId !== q.excludeEventId).map((b) => b.tableId),
    ]);
    return activeTables().filter((t) => !busy.has(t.id)).map(({ id, name }) => ({ id, name }));
  }

  // ---------- Новости ----------

  const newsView = (x) => ({
    id: x.id, coverUrl: x.coverUrl, title: x.title, text: x.text, publishedAt: iso(x.publishedAt), createdAt: iso(x.createdAt), updatedAt: iso(x.updatedAt),
  });
  const sortedNews = () => [...S.news].sort((a, b) => b.publishedAt - a.publishedAt);
  const findNews = (id) => S.news.find((x) => x.id === Number(id)) ?? fail(404, 'News not found');

  // ---------- D&D ----------

  const occupied = (gameId) => S.dndBookings.filter((b) => b.gameId === gameId && b.status === 'active').reduce((s, b) => s + b.quantity, 0);
  const gameView = (g) => {
    const occ = occupied(g.id);
    const available = Math.max(0, g.capacity - occ);
    return {
      id: g.id, title: g.title, description: g.description, gameType: g.gameType, startsAt: localIso(g.startsAt),
      endsAt: g.endsAt ? localIso(g.endsAt) : null, capacity: g.capacity, occupied: occ, available, imageUrl: g.imageUrl,
      status: g.status, isBookable: g.status === 'open' && g.startsAt.getTime() > Date.now() && available > 0,
    };
  };
  const adminGameView = (g) => ({
    ...gameView(g),
    bookingsCount: S.dndBookings.filter((b) => b.gameId === g.id && b.status === 'active').length,
    trialRequestsCount: S.trialRequests.filter((t) => t.gameId === g.id).length,
    createdAt: iso(g.createdAt), updatedAt: iso(g.updatedAt),
  });
  const bookingView = (b) => ({
    id: b.id, gameId: b.gameId, quantity: b.quantity, timeIsConvenient: b.timeIsConvenient, experienceLevel: b.experienceLevel,
    experienceLabel: b.experienceLevel ? expLabel(b.experienceLevel) : null, status: b.status, createdAt: iso(b.createdAt), cancelledAt: iso(b.cancelledAt),
  });
  const trialView = (t) => ({
    id: t.id, playersCount: t.playersCount, preferredTimes: [...t.preferredTimes], preferredTimeLabels: t.preferredTimes.map(timeLabel),
    experienceLevel: t.experienceLevel, experienceLabel: t.experienceLevel ? expLabel(t.experienceLevel) : null, isPrivate: t.isPrivate,
    notes: t.notes, status: t.status, gameId: t.gameId, createdAt: iso(t.createdAt),
  });
  const userInfo = (id) => {
    const u = userById(id);
    return { id: u.id, telegramId: u.telegramId, firstName: u.firstName, lastName: u.lastName || null, username: u.username || null };
  };
  const findGame = (id) => S.dndGames.find((g) => g.id === Number(id));

  function optionalText(v, field, max) {
    if (v === undefined || v === null) return null;
    if (typeof v !== 'string') fail(400, `${field} must be text`);
    const t = v.trim();
    if (!t) return null;
    if (t.length > max) fail(400, `${field} must be at most ${max} characters`);
    return t;
  }
  const requiredText = (v, field, max) => optionalText(v, field, max) ?? fail(400, `${field} is required`);
  const parseDate = (v, field) => {
    const d = new Date(typeof v === 'string' || typeof v === 'number' ? v : NaN);
    if (Number.isNaN(d.getTime())) fail(400, `${field} must be a valid date`);
    return d;
  };
  const parseCapacity = (v) => {
    const c = Number(v);
    if (!Number.isInteger(c) || c < 1 || c > 100) fail(400, 'capacity must be from 1 to 100');
    return c;
  };
  const parseStatus = (v) => (['draft', 'open', 'closed', 'cancelled'].includes(v) ? v : fail(400, 'status is invalid'));

  function saveGame(existing, body) {
    const startsAt = body.startsAt === undefined && existing ? existing.startsAt : parseDate(body.startsAt, 'startsAt');
    const endsAt = body.endsAt === undefined ? existing?.endsAt ?? null : body.endsAt === null || body.endsAt === '' ? null : parseDate(body.endsAt, 'endsAt');
    if (endsAt && endsAt <= startsAt) fail(400, 'endsAt must be after startsAt');
    const capacity = body.capacity === undefined && existing ? existing.capacity : parseCapacity(body.capacity);
    if (existing) {
      const occ = occupied(existing.id);
      if (capacity < occ) fail(400, `Capacity cannot be less than ${occ} already booked places`);
    }
    const g = existing ?? { id: ++S.seq.game, createdAt: new Date() };
    Object.assign(g, {
      title: body.title === undefined && existing ? g.title : requiredText(body.title, 'title', 120),
      description: body.description === undefined && existing ? g.description : optionalText(body.description, 'description', 4000),
      gameType: body.gameType === undefined && existing ? g.gameType : requiredText(body.gameType, 'gameType', 60),
      startsAt, endsAt, capacity,
      imageUrl: body.imageUrl === undefined && existing ? g.imageUrl : optionalText(body.imageUrl, 'imageUrl', 1000),
      status: body.status === undefined ? existing?.status ?? 'open' : parseStatus(body.status),
      updatedAt: new Date(),
    });
    if (!existing) S.dndGames.push(g);
    return adminGameView(g);
  }

  // ---------- Пользователи ----------

  const adminUserView = (u) => ({
    id: u.id, telegramId: u.telegramId, firstName: u.firstName, lastName: u.lastName || null, username: u.username || null,
    photoUrl: u.photoUrl || null, reservationsCount: S.reservations.filter((r) => r.userId === u.id).length,
  });

  // ---------- Маршрутизация ----------

  const log = (line) => console.log(line);
  const who = (u) => `${u.firstName} ${u.lastName ?? ''}`.trim();

  const num = (v, name, { min } = {}) => {
    if (v === undefined) return undefined;
    const n = Number(v);
    if (v === '' || !Number.isFinite(n) || (min !== undefined && n < min)) invalid(`Expected number for ${name}`);
    return n;
  };
  const oneOf = (v, name, values) => (v === undefined || values.includes(v) ? v : invalid(`Invalid value for ${name}`));
  const datePattern = (v, name) => (v === undefined || /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : invalid(`Expected YYYY-MM-DD for ${name}`));

  function reservationsQuery(q) {
    return {
      date: datePattern(q.date, 'date'),
      serviceId: num(q.serviceId, 'serviceId'),
      tableId: num(q.tableId, 'tableId'),
      status: oneOf(q.status, 'status', ['pending', 'confirmed', 'cancelled']),
      userId: q.userId,
      startsAt: q.startsAt,
      endsAt: q.endsAt,
      sortBy: oneOf(q.sortBy, 'sortBy', ['startsAt', 'createdAt', 'status']),
      sortOrder: oneOf(q.sortOrder, 'sortOrder', ['asc', 'desc']),
      limit: (() => {
        const n = num(q.limit, 'limit', { min: 1 });
        return n !== undefined && n > 100 ? invalid('limit must be at most 100') : n;
      })(),
      offset: num(q.offset, 'offset', { min: 0 }),
    };
  }

  // [method, pattern, access, handler({ user, m, q, body })]
  const routes = [
    // --- публичные ---
    ['GET', /^\/booking-options$/, 'public', () => ({ ...OPTIONS, allowedWeekdays: CFG.allowedWeekdays, timeZone: CFG.timeZone, timezoneOffsetMinutes: CFG.tzMin })],
    ['GET', /^\/disciplines$/, 'public', () => [...S.disciplines].sort((a, b) => a.sortOrder - b.sortOrder)],
    ['GET', /^\/services$/, 'public', ({ q }) => {
      // На бэкенде disciplineId обязателен (t.Number) — без него Elysia отвечает 422.
      // Демо отдаёт все услуги, чтобы админка оставалась рабочей (см. отчёт: баг клиента).
      const disciplineId = num(q.disciplineId, 'disciplineId');
      if (disciplineId === undefined) log('⚠ GET /services без disciplineId: настоящий бэкенд вернёт 422');
      return S.services.filter((s) => disciplineId === undefined || s.disciplineId === disciplineId).sort((a, b) => a.sortOrder - b.sortOrder);
    }],
    ['GET', /^\/services\/(\d+)$/, 'public', ({ m }) => service(m[1]) ?? fail(404, 'Service not found')],
    ['GET', /^\/services\/(\d+)\/availability$/, 'public', ({ m, q }) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(q.date ?? '')) invalid('Expected date in YYYY-MM-DD format');
      let a;
      try {
        a = availability(Number(m[1]), q.date);
      } catch {
        fail(400, 'Invalid date');
      }
      return a ?? fail(404, 'Service not found');
    }],
    ['GET', /^\/news$/, 'public', () => sortedNews().filter((x) => x.publishedAt <= new Date()).map(newsView)],
    ['GET', /^\/news\/(\d+)$/, 'public', ({ m }) => {
      const x = S.news.find((n) => n.id === Number(m[1]) && n.publishedAt <= new Date());
      return x ? newsView(x) : fail(404, 'News not found');
    }],
    ['GET', /^\/events$/, 'public', () => S.events.filter((e) => e.endsAt > new Date()).sort((a, b) => a.startsAt - b.startsAt).map(eventView)],
    ['GET', /^\/events\/nearest$/, 'public', () => {
      const e = nearestEvent();
      return e ? publicEventView(e) : fail(404, 'No upcoming events');
    }],
    ['GET', /^\/events\/(\d+)$/, 'public', ({ m }) => eventView(findEvent(m[1]))],
    ['GET', /^\/dnd\/games$/, 'public', () =>
      S.dndGames.filter((g) => ['open', 'closed'].includes(g.status) && g.startsAt > new Date()).sort((a, b) => a.startsAt - b.startsAt).map(gameView)],
    ['GET', /^\/dnd\/games\/(\d+)$/, 'public', ({ m }) => {
      const g = findGame(m[1]);
      return g && g.status !== 'draft' ? gameView(g) : fail(404, 'Game not found');
    }],

    // --- пользователь ---
    ['GET', /^\/reservations\/my$/, 'user', ({ user }) => {
      const e = nearestEvent();
      const reg = e && S.registrations.find((r) => r.eventId === e.id && r.userId === user.id);
      return {
        reservations: listReservations({ userId: user.id }),
        event: reg ? { ...publicEventView(e), isRegistered: true, partySize: reg.partySize } : null,
      };
    }],
    ['POST', /^\/reservations$/, 'user', ({ user, body }) => {
      if (!(Number(body.serviceId) >= 1) || typeof body.serviceId !== 'number') invalid('Expected serviceId');
      for (const k of ['tableId', 'partySize']) if (body[k] !== undefined && typeof body[k] !== 'number') invalid(`Expected number for ${k}`);
      if (body.startsAt !== undefined && typeof body.startsAt !== 'string') invalid('Expected string for startsAt');
      return createReservation(user, body);
    }],
    ['DELETE', /^\/reservations\/([^/]+)\/cancel$/, 'user', ({ user, m }) => {
      const r = S.reservations.find((x) => x.id === m[1] && x.userId === user.id) ?? fail(404, 'Reservation not found');
      if (r.status === 'cancelled') fail(409, 'Reservation is already cancelled');
      r.status = 'cancelled';
      r.cancelledAt = new Date();
      log(`− ${who(user)} отменил запись ${r.id}`);
      return { ...toResponse(r), status: 'cancelled', cancelledAt: iso(r.cancelledAt) };
    }],
    ['PATCH', /^\/reservations\/([^/]+)\/details$/, 'user', ({ user, m, body }) => {
      const r = S.reservations.find((x) => x.id === m[1] && x.userId === user.id) ?? fail(404, 'Reservation not found');
      if (r.status === 'cancelled') fail(409, 'Reservation is cancelled');
      if (r.startsAt.getTime() <= Date.now()) fail(400, 'The booking has already started');
      const kind = detailsKind(service(r.serviceId).slug);
      if (kind === null) fail(400, 'This booking has no editable details');
      r.details = validateDetails(kind, body.details);
      return toResponse(r);
    }],
    ['POST', /^\/events\/(\d+)\/register$/, 'user', ({ user, m, body }) => {
      const partySize = body.partySize ?? 1;
      if (typeof partySize !== 'number' || partySize < 1) invalid('partySize must be at least 1');
      const e = findEvent(m[1]);
      if (e.startsAt <= new Date()) fail(400, 'Event registration is closed');
      if (S.registrations.some((r) => r.eventId === e.id && r.userId === user.id)) fail(409, 'You are already registered for this event');
      if (registeredSeats(e.id) + partySize > e.tableIds.length * e.seatsPerTable) fail(409, 'Not enough seats available');
      const reg = { eventId: e.id, userId: user.id, partySize, createdAt: new Date() };
      S.registrations.push(reg);
      log(`＋ ${who(user)} записался на ивент «${e.title}» (${partySize})`);
      return { eventId: e.id, userId: user.id, partySize, createdAt: iso(reg.createdAt) };
    }],
    ['DELETE', /^\/events\/(\d+)\/register$/, 'user', ({ user, m }) => {
      const e = findEvent(m[1]);
      if (e.startsAt <= new Date()) fail(400, 'Event registration is closed');
      const i = S.registrations.findIndex((r) => r.eventId === e.id && r.userId === user.id);
      if (i < 0) fail(404, 'You are not registered for this event');
      const [reg] = S.registrations.splice(i, 1);
      return { eventId: e.id, userId: user.id, partySize: reg.partySize, createdAt: iso(reg.createdAt) };
    }],
    ['GET', /^\/dnd\/my$/, 'user', ({ user }) => ({
      bookings: S.dndBookings
        .filter((b) => b.userId === user.id)
        .map((b) => ({ b, g: findGame(b.gameId) }))
        .filter((x) => x.g)
        .sort((a, b) => b.g.startsAt - a.g.startsAt)
        .slice(0, 50)
        .map(({ b, g }) => ({ ...bookingView(b), game: gameView(g) })),
      trialRequests: S.trialRequests.filter((t) => t.userId === user.id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 20).map(trialView),
    })],
    ['POST', /^\/dnd\/games\/(\d+)\/bookings$/, 'user', ({ user, m, body }) => {
      if (typeof body.quantity !== 'number' || body.quantity < 1 || typeof body.timeIsConvenient !== 'boolean' || typeof body.experienceLevel !== 'string') {
        invalid('quantity, timeIsConvenient and experienceLevel are required');
      }
      if (!isExp(body.experienceLevel)) fail(400, 'experienceLevel is invalid');
      const quantity = body.quantity;
      if (!Number.isInteger(quantity) || quantity > OPTIONS.dndMaxPlayersPerRequest) {
        fail(400, `quantity must be from 1 to ${OPTIONS.dndMaxPlayersPerRequest}`);
      }
      const g = findGame(m[1]);
      if (!g || g.status === 'draft') fail(404, 'Game not found');
      if (g.status !== 'open') fail(400, 'Booking for this game is closed');
      if (g.startsAt.getTime() <= Date.now()) fail(400, 'This game has already started');
      if (S.dndBookings.some((b) => b.gameId === g.id && b.userId === user.id && b.status === 'active')) {
        fail(409, 'You are already booked for this game');
      }
      const available = Math.max(0, g.capacity - occupied(g.id));
      if (quantity > available) fail(409, available === 0 ? 'No places left in this game' : `Only ${available} places left in this game`);
      const b = {
        id: uuid('b0000000', ++S.seq.bn), gameId: g.id, userId: user.id, quantity, timeIsConvenient: body.timeIsConvenient,
        experienceLevel: body.experienceLevel, status: 'active', createdAt: new Date(), cancelledAt: null,
      };
      S.dndBookings.push(b);
      log(`🐉 ${who(user)} записался на D&D «${g.title}» (${quantity})`);
      return bookingView(b);
    }],
    ['DELETE', /^\/dnd\/bookings\/([^/]+)$/, 'user', ({ user, m }) => {
      const b = S.dndBookings.find((x) => x.id === m[1] && x.userId === user.id);
      if (!b || b.status !== 'active') fail(404, 'Booking not found');
      if (findGame(b.gameId).startsAt.getTime() <= Date.now()) fail(400, 'This game has already started');
      b.status = 'cancelled';
      b.cancelledAt = new Date();
      return bookingView(b);
    }],
    ['POST', /^\/dnd\/trial-requests$/, 'user', ({ user, body }) => {
      if (typeof body.playersCount !== 'number' || body.playersCount < 1) invalid('playersCount is required');
      const playersCount = body.playersCount;
      if (!Number.isInteger(playersCount) || playersCount > OPTIONS.dndMaxPlayersPerRequest) {
        fail(400, `playersCount must be from 1 to ${OPTIONS.dndMaxPlayersPerRequest}`);
      }
      const preferredTimes = [...new Set(body.preferredTimes ?? [])];
      if (!preferredTimes.every((t) => OPTIONS.dndTimePreferences.some((o) => o.value === t))) {
        fail(400, 'preferredTimes contains invalid values');
      }
      const exp = body.experienceLevel;
      if (exp !== undefined && exp !== null && exp !== '' && !isExp(exp)) fail(400, 'experienceLevel is invalid');
      const notes = optionalText(body.notes, 'notes', 500);
      if (S.trialRequests.some((t) => t.userId === user.id && t.status === 'new')) {
        fail(409, 'You already have an open request. Cancel it to send a new one.');
      }
      const t = {
        id: uuid('c0000000', ++S.seq.tn), userId: user.id, playersCount, preferredTimes, experienceLevel: exp || null,
        isPrivate: body.isPrivate === true, notes, status: 'new', gameId: null, createdAt: new Date(), updatedAt: new Date(),
      };
      S.trialRequests.push(t);
      log(`🎲 ${who(user)} оставил заявку «Хочу попробовать» (${playersCount})`);
      return trialView(t);
    }],
    ['DELETE', /^\/dnd\/trial-requests\/([^/]+)$/, 'user', ({ user, m }) => {
      const t = S.trialRequests.find((x) => x.id === m[1] && x.userId === user.id && x.status === 'new') ?? fail(404, 'Request not found');
      t.status = 'cancelled';
      t.updatedAt = new Date();
      return trialView(t);
    }],

    // --- администратор ---
    ['GET', /^\/admin\/reservations\/count$/, 'admin', ({ q }) => ({ count: filterReservations(reservationsQuery(q)).length })],
    ['GET', /^\/admin\/reservations$/, 'admin', ({ q }) => listReservations(reservationsQuery(q))],
    ['PATCH', /^\/admin\/reservations\/([^/]+)\/confirm$/, 'admin', ({ m }) => {
      const r = findRes(m[1]);
      if (r.status === 'cancelled') fail(409, 'Reservation is cancelled');
      if (r.status === 'confirmed') fail(409, 'Reservation is already confirmed');
      r.status = 'confirmed';
      return toResponse(r);
    }],
    ['PATCH', /^\/admin\/reservations\/([^/]+)\/reject$/, 'admin', ({ m }) => {
      const r = findRes(m[1]);
      if (r.status === 'cancelled') fail(409, 'Reservation is already cancelled');
      r.status = 'cancelled';
      r.cancelledAt = new Date();
      return { ...toResponse(r), status: 'cancelled', cancelledAt: iso(r.cancelledAt) };
    }],
    ['PATCH', /^\/admin\/reservations\/([^/]+)\/extend$/, 'admin', ({ m, body }) => {
      if (typeof body.endsAt !== 'string') invalid('endsAt is required');
      const endsAt = parseIso(body.endsAt);
      const r = findRes(m[1]);
      if (r.status === 'cancelled') fail(409, 'Reservation is cancelled');
      if (endsAt <= r.startsAt) fail(400, 'endsAt must be after startsAt');
      if (endsAt > sessionBounds(toLocalParts(r.startsAt)).closeAt) fail(400, 'endsAt cannot be later than club closing time');
      r.endsAt = endsAt;
      return toResponse(r);
    }],
    ['PATCH', /^\/admin\/reservations\/([^/]+)\/move$/, 'admin', ({ m, body }) => {
      if (typeof body.tableId !== 'number' || body.tableId < 1) invalid('tableId is required');
      const r = findRes(m[1]);
      if (r.status === 'cancelled') fail(409, 'Reservation is cancelled');
      if (r.tableId === body.tableId) return toResponse(r);
      const s = service(r.serviceId);
      const mode = resolveMode(s);
      if (mode.mode !== 'table') fail(400, 'Only table bookings can be moved');
      if (!S.tables.some((t) => t.id === body.tableId && t.isActive)) fail(400, 'Table not found');
      const { openAt, closeAt } = sessionBounds(toLocalParts(r.startsAt));
      const check = checkTableSession({
        tableId: body.tableId, serviceId: r.serviceId, startsAt: r.startsAt, endsAt: r.endsAt, partySize: r.partySize ?? 1,
        seatsPerTable: mode.seatsPerTable, bookings: tableBookings([body.tableId], openAt, closeAt).filter((b) => b.id !== r.id),
        blocks: eventBlocks([body.tableId], openAt, closeAt),
      });
      if (!check.ok) fail(409, 'The target table is not free for this game');
      r.tableId = body.tableId;
      return toResponse(r);
    }],
    ['GET', /^\/admin\/warhammer\/day$/, 'admin', ({ q }) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(q.date ?? '')) invalid('Expected date in YYYY-MM-DD format');
      let bounds;
      try {
        bounds = sessionBounds(parseDateParam(q.date));
      } catch (e) {
        fail(400, e.message);
      }
      const tables = activeTables().map(({ id, name }) => ({ id, name }));
      const svcs = S.services.filter((s) => [...WH_SLUGS, 'wh_painting'].includes(s.slug));
      const rows = S.reservations
        .filter((r) => svcs.some((s) => s.id === r.serviceId) && isActiveRes(r) && r.startsAt < bounds.closeAt && r.endsAt > bounds.openAt)
        .sort((a, b) => a.startsAt - b.startsAt);
      const toPlayer = (r) => ({
        reservationId: r.id, status: r.status, partySize: r.partySize ?? 1, details: r.details ?? null,
        seatClubArmyOptions: r.seatClubArmyOptions, user: userInfo(r.userId),
      });
      const sessions = [];
      const painting = [];
      let paintingCapacity = null;
      for (const s of svcs) {
        const mode = resolveMode(s);
        const own = rows.filter((r) => r.serviceId === s.id);
        if (mode.mode === 'pool') {
          if (s.slug === 'wh_painting') paintingCapacity = mode.capacity;
          for (const r of own) {
            painting.push({ ...toPlayer(r), serviceId: s.id, serviceSlug: s.slug, serviceTitle: s.title, startsAt: localIso(r.startsAt), endsAt: localIso(r.endsAt) });
          }
          continue;
        }
        if (mode.mode !== 'table') continue;
        for (const g of groupSessions(own.filter((r) => r.tableId !== null), s.id)) {
          const ids = new Set(g.bookings.map((b) => b.id));
          sessions.push({
            serviceId: s.id, serviceSlug: s.slug, serviceTitle: s.title, hasTrainer: s.hasTrainer, tableId: g.tableId,
            tableName: tables.find((t) => t.id === g.tableId)?.name ?? `Неактивный стол #${g.tableId}`,
            startsAt: localIso(g.startsAt), endsAt: localIso(g.endsAt), occupied: g.occupied, capacity: mode.seatsPerTable,
            freeSeats: Math.max(0, mode.seatsPerTable - g.occupied), players: rows.filter((r) => ids.has(r.id)).map(toPlayer),
          });
        }
      }
      sessions.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.tableId - b.tableId);
      return { date: q.date, tables, sessions, painting, paintingCapacity };
    }],
    ['GET', /^\/admin\/users$/, 'admin', ({ q }) => {
      const name = String(q.username ?? '').trim().replace(/^@/, '').toLowerCase();
      if (!q.username) invalid('username is required');
      const limit = Math.min(Math.max(num(q.limit, 'limit') ?? 20, 1), 50);
      return name ? allUsers().filter((u) => (u.username ?? '').toLowerCase().includes(name)).slice(0, limit).map(adminUserView) : [];
    }],
    ['GET', /^\/admin\/users\/([^/]+)$/, 'admin', ({ m }) => {
      const u = userById(decodeURIComponent(m[1]));
      return u ? adminUserView(u) : fail(404, 'User not found');
    }],
    ['GET', /^\/admin\/news$/, 'admin', () => sortedNews().map(newsView)],
    ['GET', /^\/admin\/news\/(\d+)$/, 'admin', ({ m }) => newsView(findNews(m[1]))],
    ['POST', /^\/admin\/news$/, 'admin', ({ body }) => {
      for (const k of ['coverUrl', 'title', 'text']) if (typeof body[k] !== 'string' || !body[k]) invalid(`${k} is required`);
      const now = new Date();
      const x = {
        id: ++S.seq.news, coverUrl: body.coverUrl, title: body.title, text: body.text,
        publishedAt: body.publishedAt !== undefined ? parseIso(body.publishedAt) : now, createdAt: now, updatedAt: now,
      };
      S.news.push(x);
      return newsView(x);
    }],
    ['PATCH', /^\/admin\/news\/(\d+)$/, 'admin', ({ m, body }) => {
      const x = findNews(m[1]);
      for (const k of ['coverUrl', 'title', 'text']) {
        if (body[k] !== undefined && (typeof body[k] !== 'string' || !body[k])) invalid(`${k} must be a non-empty string`);
        if (body[k] !== undefined) x[k] = body[k];
      }
      if (body.publishedAt !== undefined) x.publishedAt = parseIso(body.publishedAt);
      x.updatedAt = new Date();
      return newsView(x);
    }],
    ['DELETE', /^\/admin\/news\/(\d+)$/, 'admin', ({ m }) => {
      const x = findNews(m[1]);
      S.news = S.news.filter((n) => n !== x);
      return newsView(x);
    }],
    ['GET', /^\/admin\/events$/, 'admin', () => [...S.events].sort((a, b) => a.startsAt - b.startsAt).map(eventView)],
    ['GET', /^\/admin\/events\/empty-tables$/, 'admin', ({ q }) => {
      if (typeof q.startsAt !== 'string') invalid('startsAt is required');
      return emptyTables({ ...q, excludeEventId: num(q.excludeEventId, 'excludeEventId') });
    }],
    ['GET', /^\/admin\/events\/(\d+)$/, 'admin', ({ m }) => eventView(findEvent(m[1]))],
    ['POST', /^\/admin\/events$/, 'admin', ({ body }) => upsertEvent(null, body)],
    ['PATCH', /^\/admin\/events\/(\d+)$/, 'admin', ({ m, body }) => upsertEvent(findEvent(m[1]), body)],
    ['DELETE', /^\/admin\/events\/(\d+)$/, 'admin', ({ m }) => {
      const e = findEvent(m[1]);
      S.events = S.events.filter((x) => x !== e);
      S.registrations = S.registrations.filter((r) => r.eventId !== e.id);
      return eventView(e);
    }],
    ['GET', /^\/admin\/dnd\/games$/, 'admin', () => [...S.dndGames].sort((a, b) => b.startsAt - a.startsAt).map(adminGameView)],
    ['POST', /^\/admin\/dnd\/games$/, 'admin', ({ body }) => saveGame(null, body)],
    ['PATCH', /^\/admin\/dnd\/games\/(\d+)$/, 'admin', ({ m, body }) => saveGame(findGame(m[1]) ?? fail(404, 'Game not found'), body)],
    ['DELETE', /^\/admin\/dnd\/games\/(\d+)$/, 'admin', ({ m }) => {
      const id = Number(m[1]);
      if (occupied(id) > 0) fail(409, 'The game has bookings. Set its status to "cancelled" instead of deleting.');
      const g = findGame(id) ?? fail(404, 'Game not found');
      S.dndGames = S.dndGames.filter((x) => x !== g);
      S.dndBookings = S.dndBookings.filter((b) => b.gameId !== id);
      for (const t of S.trialRequests) if (t.gameId === id) t.gameId = null;
      return { id };
    }],
    ['GET', /^\/admin\/dnd\/games\/(\d+)\/bookings$/, 'admin', ({ m }) =>
      S.dndBookings.filter((b) => b.gameId === Number(m[1])).sort((a, b) => a.createdAt - b.createdAt).map((b) => ({ ...bookingView(b), user: userInfo(b.userId) }))],
    ['GET', /^\/admin\/dnd\/trial-requests$/, 'admin', ({ q }) => {
      const status = oneOf(q.status, 'status', ['new', 'grouped', 'cancelled']);
      return S.trialRequests
        .filter((t) => !status || t.status === status)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 200)
        .map((t) => ({ ...trialView(t), user: userInfo(t.userId) }));
    }],
    ['PATCH', /^\/admin\/dnd\/trial-requests\/([^/]+)$/, 'admin', ({ m, body }) => {
      if (!['new', 'grouped', 'cancelled'].includes(body.status)) invalid('status is invalid');
      let game;
      if (body.status === 'grouped') {
        if (!Number.isInteger(Number(body.gameId)) || body.gameId === undefined) fail(400, 'gameId is required to group a request');
        game = findGame(body.gameId) ?? fail(404, 'Game not found');
      }
      const t = S.trialRequests.find((x) => x.id === m[1]) ?? fail(404, 'Request not found');
      t.status = body.status;
      t.gameId = body.status === 'grouped' ? game.id : null;
      t.updatedAt = new Date();
      return trialView(t);
    }],
  ];

  async function readRaw(req) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    return Buffer.concat(chunks);
  }

  function parseMultipart(buf, contentType) {
    const b = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
    if (!b) return {};
    const boundary = Buffer.from(`--${b[1] || b[2]}`);
    const out = {};
    let pos = buf.indexOf(boundary);
    while (pos !== -1) {
      const next = buf.indexOf(boundary, pos + boundary.length);
      if (next === -1) break;
      const part = buf.subarray(pos + boundary.length + 2, next - 2);
      const sep = part.indexOf('\r\n\r\n');
      if (sep !== -1) {
        const head = part.subarray(0, sep).toString();
        const data = part.subarray(sep + 4);
        const name = /name="([^"]*)"/i.exec(head)?.[1];
        const filename = /filename="([^"]*)"/i.exec(head)?.[1];
        const type = /content-type:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim();
        if (name) out[name] = filename !== undefined ? { filename, type, data } : data.toString();
      }
      pos = next;
    }
    return out;
  }

  async function upload(req) {
    const form = parseMultipart(await readRaw(req), req.headers['content-type']);
    if (typeof form.dest !== 'string' || typeof form.file !== 'object') invalid('dest and file are required');
    if (!CFG.uploadDest.includes(form.dest)) fail(400, 'Invalid dest folder');
    const types = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
    if (!types[form.file.type]) fail(400, 'Only image files are allowed');
    const ext = /\.[a-z0-9]+$/i.exec(form.file.filename)?.[0]?.toLowerCase() || types[form.file.type];
    const key = `${form.dest}/${uuid('d0000000', ++S.seq.upload)}${ext}`;
    S.uploads.set(key, { type: form.file.type, data: form.file.data });
    log(`🖼  Загружено ${key} (${form.file.data.length} байт)`);
    return { url: `/demo-img/uploads/${key}`, key };
  }

  /**
   * Обрабатывает /api/*. Возвращает false, если путь не наш (auth, /me, roster — их ведёт server.mjs).
   */
  async function handle(req, res, p, user, send) {
    const method = req.method;
    if (p === '/__reset' && (method === 'GET' || method === 'POST')) {
      reset();
      log('↺ Демо-данные сброшены к исходным');
      send(res, 200, { ok: true, seededAt: new Date().toISOString() });
      return true;
    }
    if (p === '/me' || p.startsWith('/roster/') || p.startsWith('/admin/roster/') || p === '/auth/telegram') return false;

    const q = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    const candidates = routes.filter(([, re]) => re.test(p));
    if (candidates.length === 0) {
      if (p === '/admin/upload' && method === 'POST') {
        if (!user) return send(res, 401, { error: 'Unauthorized' }), true;
        if (!users.find((u) => u.id === user.id)?.admin) return send(res, 403, { error: 'Forbidden' }), true;
        try {
          send(res, 200, await upload(req));
        } catch (e) {
          if (!(e instanceof ApiError)) throw e;
          send(res, e.status, e.status === 422 ? { type: 'validation', message: e.message } : { error: e.message });
        }
        return true;
      }
      log(`⚠ Нет обработчика: ${method} /api${p}`);
      send(res, 404, { error: 'NOT_FOUND' });
      return true;
    }
    const route = candidates.find(([m]) => m === method);
    if (!route) {
      send(res, 404, { error: 'NOT_FOUND' });
      return true;
    }
    const [, re, access, fn] = route;
    if (access !== 'public' && !user) return send(res, 401, { error: 'Unauthorized' }), true;
    if (access === 'admin' && !user.admin) return send(res, 403, { error: 'Forbidden' }), true;
    try {
      let body = {};
      if (method !== 'GET' && method !== 'DELETE') {
        const raw = (await readRaw(req)).toString();
        try {
          body = raw ? JSON.parse(raw) : {};
        } catch {
          invalid('Invalid JSON body');
        }
        if (body === null || typeof body !== 'object') body = {};
      }
      send(res, 200, fn({ user, m: re.exec(p), q, body }));
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      send(res, e.status, e.status === 422 ? { type: 'validation', message: e.message } : { error: e.message });
    }
    return true;
  }

  /** Статика картинок: /demo-img/*, /s3/*. Возвращает true, если ответ отправлен. */
  function asset(res, p) {
    let name;
    if (p.startsWith('/demo-img/uploads/')) {
      const f = S.uploads.get(decodeURIComponent(p.slice('/demo-img/uploads/'.length)));
      if (!f) return false;
      res.writeHead(200, { 'content-type': f.type, 'cache-control': 'no-store' });
      res.end(f.data);
      return true;
    }
    if (p.startsWith('/demo-img/')) name = p.slice('/demo-img/'.length);
    else if (p.startsWith('/s3/')) name = p.slice('/s3/'.length).replace(/^(undefined|[^/]*bucket[^/]*)\//, '');
    else return false;
    res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' });
    res.end(placeholderSvg(decodeURIComponent(name)));
    return true;
  }

  return { handle, asset, reset, extraUsers: EXTRA_USERS };
}
