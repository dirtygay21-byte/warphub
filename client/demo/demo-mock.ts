/**
 * Демо-режим: подменяет запросы к серверу образцовыми данными прямо в браузере.
 * Используется только для демо-сборки (GitHub Pages), в рабочую сборку не входит.
 * Записи «сохраняются» только до перезагрузки страницы.
 */
const pad = (n: number) => String(n).padStart(2, "0");

// «Сегодня» по времени клуба (UTC+5)
const clubNow = new Date(Date.now() + 5 * 3600e3);
const dayKey = (offset: number) => {
  const d = new Date(Date.UTC(clubNow.getUTCFullYear(), clubNow.getUTCMonth(), clubNow.getUTCDate() + offset));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const daysUntil = (isoDay: number) => ((isoDay - (clubNow.getUTCDay() || 7) + 7) % 7) || 7;
const FRI = dayKey(daysUntil(5));
const SAT = dayKey(daysUntil(6));
const THU = dayKey(daysUntil(4));
const NEXT_SAT = dayKey(daysUntil(6) + 7);
const at = (date: string, h: number, m = 0) => `${date}T${pad(h)}:${pad(m)}:00+05:00`;
const nextDay = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;

const disciplines = [
  { id: 2, slug: "wh", title: "Warhammer", isActive: true, sortOrder: 1, scheduleWeekdays: [5, 6, 7] },
  { id: 1, slug: "dnd", title: "D&D", isActive: true, sortOrder: 2, scheduleWeekdays: [1, 2, 3, 4] },
  { id: 3, slug: "club", title: "Посещение клуба", isActive: true, sortOrder: 3, scheduleWeekdays: [5, 6, 7] },
];
const svc = (o: Record<string, unknown>) => ({
  isActive: true, sortOrder: 0, visitorsCapacity: null, tableCapacityProfile: null,
  seatsPerTable: null, poolCapacity: null, hasTrainer: false, description: null, ...o,
});
const services: any[] = [
  svc({ id: 2, disciplineId: 2, slug: "wh_game", title: "Игра", duration: 180, seatsPerTable: 2, tableCapacityProfile: "small", sortOrder: 1, description: "Партия Warhammer 40,000 за столом клуба" }),
  svc({ id: 4, disciplineId: 2, slug: "wh_solo_training", title: "Индивидуальная тренировка", duration: 120, seatsPerTable: 1, hasTrainer: true, tableCapacityProfile: "small", sortOrder: 2, description: "Тренер разберёт правила и тактику" }),
  svc({ id: 3, disciplineId: 2, slug: "wh_group_training", title: "Групповая тренировка", duration: 120, seatsPerTable: 2, hasTrainer: true, tableCapacityProfile: "small", sortOrder: 3, description: "Два игрока и тренер" }),
  svc({ id: 6, disciplineId: 2, slug: "wh_painting", title: "Покраска миниатюр", duration: 120, poolCapacity: 5, sortOrder: 4, description: "Красим миниатюры за общим столом" }),
  svc({ id: 1, disciplineId: 1, slug: "dnd_game", title: "Игра D&D", duration: 240, isActive: false }),
  svc({ id: 5, disciplineId: 3, slug: "club_visit", title: "Посещение клуба", duration: 600, poolCapacity: 25, visitorsCapacity: 5, description: "Приходите посмотреть игры" }),
];
const factions = ["Adepta Sororitas", "Adeptus Custodes", "Adeptus Mechanicus", "Aeldari", "Agents of the Imperium", "Astra Militarum", "Black Templars", "Blood Angels", "Chaos Daemons", "Chaos Knights", "Chaos Space Marines", "Dark Angels", "Death Guard", "Deathwatch", "Drukhari", "Emperor's Children", "Genestealer Cults", "Grey Knights", "Imperial Knights", "Leagues of Votann", "Necrons", "Orks", "Space Marines", "Space Wolves", "T'au Empire", "Thousand Sons", "Tyranids", "World Eaters"];
const levels: Record<string, string> = { beginner: "Новичок", player: "Игрок", experienced: "Опытный", veteran: "Ветеран" };
const bookingOptions = {
  experienceLevels: [
    { value: "beginner", label: "Новичок", hint: "1–5 игр" },
    { value: "player", label: "Игрок", hint: "5–15 игр" },
    { value: "experienced", label: "Опытный", hint: "15–30 игр" },
    { value: "veteran", label: "Ветеран", hint: "30–60 игр" },
  ],
  factions,
  paintSources: [{ value: "own", label: "Свои краски" }, { value: "club", label: "Краски клуба" }],
  dndTimePreferences: [{ value: "morning", label: "Утро" }, { value: "afternoon", label: "День" }, { value: "evening", label: "Вечер" }],
  dndMaxPlayersPerRequest: 6, pointsPresets: [500, 1000, 1500, 2000], maxPoints: 10000,
  allowedWeekdays: [5, 6, 7], timeZone: "Asia/Yekaterinburg", timezoneOffsetMinutes: 300,
};

const user = { id: "demo-user", telegramId: 100000001, firstName: "Гость", lastName: "Демо", username: "demo", photoUrl: "" };
const u = (firstName: string, username: string, telegramId: number) => ({ id: `id-${username}`, telegramId, firstName, lastName: null, username });
const player = (firstName: string, army: string, points: number, level: string) => ({ firstName, army, points, experienceLevel: level, experienceLabel: levels[level] });

// Заранее занятые игры на ближайшую пятницу и субботу
const seededSessions = (date: string) => date === FRI || date === SAT
  ? [
      { tableId: 2, startsAt: at(date, 15), endsAt: at(date, 18), players: [player("Анна", "Necrons", 1000, "player"), player("Илья", "Orks", 1000, "beginner")] },
      { tableId: 1, startsAt: at(date, 18), endsAt: at(date, 21), players: [player("Егор", "Astra Militarum", 1500, "experienced")] },
    ]
  : [];

let nextId = 1;
const myReservations: any[] = [];
const myDndBookings: any[] = [];
const myTrials: any[] = [];

const dndGames: any[] = [
  { id: 1, title: "Затерянный храм", description: "Короткое приключение для новичков: древний храм, ловушки и сокровища. Персонажи готовы заранее.", gameType: "One-shot", startsAt: at(THU, 18), endsAt: at(THU, 22), capacity: 5, occupied: 3, imageUrl: null, status: "open" },
  { id: 2, title: "Пробная игра D&D", description: "Знакомство с правилами за одну встречу.", gameType: "Пробная игра", startsAt: at(SAT, 14), endsAt: at(SAT, 17), capacity: 6, occupied: 2, imageUrl: null, status: "open" },
  { id: 3, title: "Проклятие Страда", description: "Старт новой кампании.", gameType: "Кампания", startsAt: at(NEXT_SAT, 19), endsAt: null, capacity: 5, occupied: 5, imageUrl: null, status: "open" },
];
const gameView = (g: any) => ({ ...g, available: Math.max(0, g.capacity - g.occupied), isBookable: g.status === "open" && g.capacity - g.occupied > 0 });

function availability(serviceId: number, date: string) {
  const service = services.find((s) => s.id === serviceId);
  const nd = nextDay(date);
  const allowed = [5, 6, 7].includes(weekday(date));
  const base: any = {
    date, dateAllowed: allowed, allowedWeekdays: [5, 6, 7],
    service: {
      id: service.id, slug: service.slug, duration: service.duration, visitorsCapacity: service.visitorsCapacity,
      tableCapacityProfile: service.tableCapacityProfile,
      mode: service.poolCapacity ? "pool" : service.seatsPerTable ? "table" : "none",
      seatsPerTable: service.seatsPerTable, poolCapacity: service.poolCapacity, hasTrainer: service.hasTrainer,
    },
    slots: [], sessions: [],
  };
  if (!allowed) return base;
  if (service.slug === "wh_painting") {
    const taken = myReservations.filter((r) => r.serviceSlug === "wh_painting" && r.startsAt.startsWith(date)).reduce((s, r) => s + r.partySize, 0);
    base.slots = [{ table: { id: 0, name: "Покраска миниатюр", seatCapacity: 5 }, segments: [
      { startsAt: at(date, 12), endsAt: at(date, 14), freeSeats: 5 - taken },
      { startsAt: at(date, 14), endsAt: at(date, 16), freeSeats: Math.max(0, 3 - taken) },
      { startsAt: at(date, 16), endsAt: at(date, 18), freeSeats: 0 },
      { startsAt: at(date, 18), endsAt: at(nd, 0), freeSeats: 5 - taken },
    ] }];
    return base;
  }
  if (service.slug === "club_visit") {
    base.slots = [{ table: { id: 0, name: "Клуб", seatCapacity: 25 }, segments: [{ startsAt: at(date, 12), endsAt: at(nd, 0), freeSeats: 22 }] }];
    return base;
  }
  const cap = service.seatsPerTable;
  const sessions = service.slug === "wh_game" ? seededSessions(date) : [];
  const mine = myReservations.filter((r) => r.serviceId === serviceId && r.startsAt.startsWith(date) && r.status !== "cancelled");
  base.sessions = sessions.map((s) => {
    const joined = mine.filter((r) => r.tableId === s.tableId && r.startsAtLocal === s.startsAt);
    const players = [...s.players, ...joined.map((r) => player("Гость", r.details.army, r.details.points, r.details.experienceLevel))];
    return { ...s, tableName: `Стол ${s.tableId}`, occupied: players.length, capacity: cap, freeSeats: Math.max(0, cap - players.length), players };
  });
  for (const r of mine) {
    if (!base.sessions.some((s: any) => s.tableId === r.tableId && s.startsAt === r.startsAtLocal)) {
      base.sessions.push({ tableId: r.tableId, tableName: `Стол ${r.tableId}`, startsAt: r.startsAtLocal, endsAt: r.endsAtLocal, occupied: 1, capacity: cap, freeSeats: cap - 1, players: [player("Гость", r.details.army, r.details.points, r.details.experienceLevel)] });
    }
  }
  const busy = (tableId: number) => base.sessions.filter((s: any) => s.tableId === tableId).map((s: any) => [s.startsAt, s.endsAt]);
  base.slots = [1, 2].map((tableId) => {
    const marks = busy(tableId).sort();
    const segs: any[] = [];
    let cursor = at(date, 12);
    for (const [s, e] of marks) {
      if (s > cursor) segs.push({ startsAt: cursor, endsAt: s, freeSeats: cap });
      segs.push({ startsAt: s, endsAt: e, freeSeats: 0 });
      cursor = e;
    }
    segs.push({ startsAt: cursor, endsAt: at(nd, 0), freeSeats: cap });
    return { table: { id: tableId, name: `Стол ${tableId}`, seatCapacity: cap }, segments: segs };
  });
  return base;
}

const toLocal = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 5 * 3600e3);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00+05:00`;
};

const adminDay = (date: string) => ({
  date, tables: [{ id: 1, name: "Стол 1" }, { id: 2, name: "Стол 2" }], paintingCapacity: 5,
  sessions: (availability(2, date).sessions as any[]).map((s) => ({
    serviceId: 2, serviceSlug: "wh_game", serviceTitle: "Игра", hasTrainer: false, ...s,
    players: s.players.map((p: any, i: number) => ({ reservationId: `${s.tableId}-${i}`, status: i ? "pending" : "confirmed", partySize: 1, seatClubArmyOptions: [false], details: { kind: "wh_player", army: p.army, points: p.points, experienceLevel: p.experienceLevel }, user: u(p.firstName, p.firstName.toLowerCase(), 1000 + i) })),
  })),
  painting: [weekday(date) >= 5 ? { reservationId: "pp1", status: "confirmed", partySize: 1, seatClubArmyOptions: null, details: { kind: "painting", faction: "Necrons", model: "Necron Warriors", paintSource: "club", needsHelp: true, comment: "Нужен грунт" }, user: u("Олег", "oleg", 5), serviceId: 6, serviceSlug: "wh_painting", serviceTitle: "Покраска миниатюр", startsAt: at(date, 14), endsAt: at(date, 16) } : null].filter(Boolean),
});

const trials: any[] = [
  { id: "t1", playersCount: 3, preferredTimes: ["evening"], preferredTimeLabels: ["Вечер"], experienceLevel: null, experienceLabel: null, isPrivate: true, notes: "Хотим с друзьями", status: "new", gameId: null, createdAt: new Date().toISOString(), user: u("Егор", "egor", 3) },
  { id: "t2", playersCount: 1, preferredTimes: ["afternoon", "evening"], preferredTimeLabels: ["День", "Вечер"], experienceLevel: "beginner", experienceLabel: "Новичок", isPrivate: false, notes: null, status: "new", gameId: null, createdAt: new Date().toISOString(), user: u("Катя", "katya", 7) },
];

type Result = { status?: number; body: unknown };

function handle(method: string, url: URL, bodyText: string | null): Result {
  const path = url.pathname.replace(/^.*\/api/, "");
  const q = url.searchParams;
  const body = bodyText ? JSON.parse(bodyText) : {};
  let m: RegExpMatchArray | null;

  if (method === "GET") {
    if (path === "/disciplines") return { body: disciplines };
    if (path === "/services") return { body: services.filter((s) => s.disciplineId === Number(q.get("disciplineId"))) };
    if ((m = path.match(/^\/services\/(\d+)\/availability$/))) return { body: availability(Number(m[1]), q.get("date")!) };
    if ((m = path.match(/^\/services\/(\d+)$/))) return { body: services.find((s) => s.id === Number(m![1])) };
    if (path === "/booking-options") return { body: bookingOptions };
    if (path === "/events/nearest") return { status: 404, body: { error: "No upcoming events" } };
    if (path === "/dnd/games") return { body: dndGames.filter((g) => g.status === "open" || g.status === "closed").map(gameView) };
    if (path === "/dnd/my") return { body: { bookings: myDndBookings, trialRequests: myTrials } };
    if (path === "/reservations/my") return { body: { event: null, reservations: myReservations } };
    if (path === "/me") return { body: user };
    if (path === "/news") return { body: [] };
    if (path === "/admin/warhammer/day") return { body: adminDay(q.get("date")!) };
    if (path === "/admin/dnd/games") return { body: dndGames.map((g) => ({ ...gameView(g), bookingsCount: g.occupied ? 2 : 0, trialRequestsCount: 0, createdAt: "", updatedAt: "" })) };
    if ((m = path.match(/^\/admin\/dnd\/games\/(\d+)\/bookings$/))) return { body: [
      { id: "x1", gameId: Number(m[1]), quantity: 2, timeIsConvenient: true, experienceLevel: "beginner", experienceLabel: "Новичок", status: "active", createdAt: "", cancelledAt: null, user: u("Катя", "katya", 7) },
      { id: "x2", gameId: Number(m[1]), quantity: 1, timeIsConvenient: false, experienceLevel: "veteran", experienceLabel: "Ветеран", status: "active", createdAt: "", cancelledAt: null, user: u("Паша", "pasha", 9) },
    ] };
    if (path === "/admin/dnd/trial-requests") return { body: trials.filter((t) => !q.get("status") || t.status === q.get("status")) };
    if (path === "/admin/reservations") return { body: myReservations };
    if (path === "/admin/reservations/count") return { body: { count: myReservations.length } };
    if (path === "/admin/events" || path === "/admin/news" || path === "/events") return { body: [] };
  }

  if (method === "POST" && path === "/reservations") {
    const service = services.find((s) => s.id === body.serviceId);
    const start = new Date(body.startsAt);
    const end = new Date(start.getTime() + service.duration * 60e3);
    const startsAtLocal = toLocal(body.startsAt);
    const joined = service.slug === "wh_game" && seededSessions(startsAtLocal.slice(0, 10)).some((s) => s.tableId === body.tableId && s.startsAt === startsAtLocal);
    const r = {
      id: `demo-${nextId++}`, userId: user.id, serviceId: service.id, serviceSlug: service.slug, serviceTitle: service.title,
      tableId: body.tableId ?? null, tableName: body.tableId ? `Стол ${body.tableId}` : null, partySize: body.partySize ?? 1,
      seatClubArmyOptions: body.seatClubArmyOptions ?? [], buyArmyOptions: null, details: body.details ? { kind: service.slug === "wh_painting" ? "painting" : "wh_player", ...body.details } : null,
      startsAt: start.toISOString(), endsAt: end.toISOString(), startsAtLocal, endsAtLocal: toLocal(end.toISOString()),
      status: "pending", cancelledAt: null, createdAt: new Date().toISOString(), user,
    };
    myReservations.push(r);
    return { body: { ...r, joinedSession: joined } };
  }
  if (method === "DELETE" && (m = path.match(/^\/reservations\/([^/]+)\/cancel$/))) {
    const r = myReservations.find((x) => x.id === m![1]);
    if (r) { r.status = "cancelled"; r.cancelledAt = new Date().toISOString(); }
    return { body: r };
  }
  if (method === "PATCH" && (m = path.match(/^\/reservations\/([^/]+)\/details$/))) {
    const r = myReservations.find((x) => x.id === m![1]);
    if (r) r.details = { ...r.details, ...body.details };
    return { body: r };
  }
  if (method === "POST" && (m = path.match(/^\/dnd\/games\/(\d+)\/bookings$/))) {
    const g = dndGames.find((x) => x.id === Number(m![1]));
    if (body.quantity > g.capacity - g.occupied) return { status: 409, body: { error: "No places left in this game" } };
    g.occupied += body.quantity;
    const b = { id: `db-${nextId++}`, gameId: g.id, quantity: body.quantity, timeIsConvenient: body.timeIsConvenient, experienceLevel: body.experienceLevel, experienceLabel: levels[body.experienceLevel], status: "active", createdAt: new Date().toISOString(), cancelledAt: null };
    myDndBookings.push({ ...b, game: gameView(g) });
    return { body: b };
  }
  if (method === "DELETE" && (m = path.match(/^\/dnd\/bookings\/(.+)$/))) {
    const b = myDndBookings.find((x) => x.id === m![1]);
    if (b) { b.status = "cancelled"; const g = dndGames.find((x) => x.id === b.gameId); g.occupied -= b.quantity; }
    return { body: b };
  }
  if (method === "POST" && path === "/dnd/trial-requests") {
    if (myTrials.some((t) => t.status === "new")) return { status: 409, body: { error: "You already have an open request. Cancel it to send a new one." } };
    const labels: Record<string, string> = { morning: "Утро", afternoon: "День", evening: "Вечер" };
    const t = { id: `tr-${nextId++}`, playersCount: body.playersCount, preferredTimes: body.preferredTimes ?? [], preferredTimeLabels: (body.preferredTimes ?? []).map((x: string) => labels[x]), experienceLevel: body.experienceLevel, experienceLabel: body.experienceLevel ? levels[body.experienceLevel] : null, isPrivate: !!body.isPrivate, notes: body.notes, status: "new", gameId: null, createdAt: new Date().toISOString() };
    myTrials.unshift(t);
    trials.unshift({ ...t, user: u("Гость", "demo", 100000001) });
    return { body: t };
  }
  if (method === "DELETE" && (m = path.match(/^\/dnd\/trial-requests\/(.+)$/))) {
    for (const list of [myTrials, trials]) { const t = list.find((x) => x.id === m![1]); if (t) t.status = "cancelled"; }
    return { body: {} };
  }
  if (method === "POST" && path === "/admin/dnd/games") {
    const g = { id: 100 + nextId++, occupied: 0, imageUrl: null, status: "open", ...body };
    dndGames.push(g);
    return { body: { ...gameView(g), bookingsCount: 0, trialRequestsCount: 0, createdAt: "", updatedAt: "" } };
  }
  if (method === "PATCH" && (m = path.match(/^\/admin\/dnd\/games\/(\d+)$/))) {
    const g = dndGames.find((x) => x.id === Number(m![1]));
    Object.assign(g, body);
    return { body: { ...gameView(g), bookingsCount: 0, trialRequestsCount: 0, createdAt: "", updatedAt: "" } };
  }
  if (method === "DELETE" && (m = path.match(/^\/admin\/dnd\/games\/(\d+)$/))) {
    const i = dndGames.findIndex((x) => x.id === Number(m![1]));
    if (i >= 0) dndGames.splice(i, 1);
    return { body: {} };
  }
  if (method === "PATCH" && (m = path.match(/^\/admin\/dnd\/trial-requests\/(.+)$/))) {
    const t = trials.find((x) => x.id === m![1]);
    if (t) { t.status = body.status; t.gameId = body.gameId ?? null; }
    const mine = myTrials.find((x) => x.id === m![1]);
    if (mine) { mine.status = body.status; mine.gameId = body.gameId ?? null; }
    return { body: t };
  }
  if (method === "PATCH" && path.includes("/move")) return { body: {} };
  if (method === "POST" && path === "/admin/upload") return { status: 400, body: { error: "В демо загрузка картинок отключена" } };
  return { status: 404, body: { error: "Недоступно в демо" } };
}

const realFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href);
  if (!url.pathname.includes("/api/")) return realFetch(input, init);
  const method = (init?.method ?? "GET").toUpperCase();
  await new Promise((r) => setTimeout(r, 150));
  const result = handle(method, url, typeof init?.body === "string" ? init.body : null);
  return new Response(JSON.stringify(result.body), {
    status: result.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}) as typeof fetch;

// Метка «Демо» поверх приложения
const badge = document.createElement("div");
badge.textContent = "ДЕМО · данные ненастоящие";
badge.setAttribute("style", "position:fixed;top:4px;right:4px;z-index:9999;background:#ECFE46;color:#111;font:600 10px/1 system-ui,sans-serif;padding:4px 7px;border-radius:999px;opacity:.9;pointer-events:none");
document.addEventListener("DOMContentLoaded", () => document.body.appendChild(badge));
if (document.readyState !== "loading") document.body.appendChild(badge);
