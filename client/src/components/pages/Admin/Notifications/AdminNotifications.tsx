import { uploadAdminFile } from "@/apiUtils/admin";
import {
  audienceSize,
  BUTTON_TARGETS,
  createBroadcast,
  deleteBroadcast,
  GAME_OPTIONS,
  getNotificationCatalog,
  getNotificationLog,
  listBroadcasts,
  pauseBroadcast,
  previewNotificationImage,
  saveNotificationConfig,
  saveNotificationTemplate,
  startBroadcast,
  testBroadcast,
  testNotificationTemplate,
  updateBroadcast,
  type Broadcast,
  type BroadcastAudience,
  type BroadcastButton,
  type BroadcastInput,
  type BroadcastSchedule,
  type NotificationCatalog,
  type NotificationConfig,
  type NotificationGroup,
  type NotificationKindView,
} from "@/apiUtils/notifications";
import { formatClub, fromClubDatetimeLocal, toClubDatetimeLocal } from "@/utils/clubTime";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Copy, ImagePlus, LoaderCircle, Pause, Pencil, Play, Plus, Send, Trash2, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

/**
 * Уведомления (14.11.2026): рассылки владельца (текст, картинка, кнопки, аудитория, расписание),
 * автоматические уведомления (вкл/выкл, свой текст, тест себе), журнал отправок и общие настройки.
 * Менять может только владелец — сервер проверяет; остальным администраторам раздел виден только для чтения.
 */
const TABS = [
  { id: "broadcasts", label: "Рассылки" },
  { id: "auto", label: "Автоматические" },
  { id: "log", label: "Журнал" },
  { id: "settings", label: "Настройки" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const input = "w-full rounded-xl border border-white/[0.14] bg-field px-3 py-2.5 text-sm text-fg outline-none focus:border-accent/60";
const chip = (on: boolean) =>
  clsx("min-h-10 rounded-xl border px-3 text-[13px] font-semibold", on ? "border-accent bg-accent text-accent-foreground" : "border-white/[0.14] text-fg-2");
const btn = "ds-press inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-50";
const btnPrimary = clsx(btn, "bg-accent text-accent-foreground");
const btnGhost = clsx(btn, "border border-white/[0.14] text-fg");

const fmt = (iso: string | null | undefined) => (iso ? formatClub(iso, { day: "numeric", month: "short", weekday: "short", hour: "2-digit", minute: "2-digit" }) : "—");

export default function AdminNotifications() {
  const [tab, setTab] = useState<TabId>("broadcasts");
  const catalog = useQuery({ queryKey: ["notification-catalog"], queryFn: getNotificationCatalog });
  const canEdit = catalog.data?.canEdit ?? false;
  return (
    <div className="px-4 py-3 pb-28 text-fg sm:px-6">
      <div className="mb-4">
        <h1 className="font-display text-[28px] font-bold uppercase leading-none">Уведомления</h1>
        <p className="mt-1 text-sm text-fg-3">Рассылки, автоматические сообщения бота, журнал и настройки</p>
        {catalog.data && !canEdit && <p className="mt-2 rounded-xl bg-white/5 px-3 py-2 text-[13px] text-fg-2">Просмотр: менять уведомления может только владелец.</p>}
      </div>
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TABS.map((item) => (
          <button key={item.id} type="button" onClick={() => setTab(item.id)} className={chip(tab === item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      {tab === "broadcasts" && <BroadcastsTab canEdit={canEdit} />}
      {tab === "auto" && <AutoTab catalog={catalog.data} loading={catalog.isLoading} />}
      {tab === "log" && <LogTab catalog={catalog.data} />}
      {tab === "settings" && <SettingsTab catalog={catalog.data} />}
    </div>
  );
}

// ---------------------------------------------------------------- предпросмотр

/** Безопасный предпросмотр HTML Telegram: только <b>, <i>, <u>, <s>, <code>, <a href>. */
function telegramHtml(text: string) {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped
    .replace(/&lt;(\/?)(b|i|u|s|code|strong|em)&gt;/g, "<$1$2>")
    .replace(/&lt;a href="(https:\/\/[^"&]+)"&gt;/g, '<a href="$1" target="_blank" rel="noreferrer" class="underline">')
    .replace(/&lt;\/a&gt;/g, "</a>")
    .replace(/\n/g, "<br>");
}

function Preview({ text, imageUrl, buttons }: { text: string; imageUrl?: string | null; buttons?: BroadcastButton[] }) {
  return (
    <div className="max-w-sm overflow-hidden rounded-2xl rounded-bl-md bg-[#2b5278]/40 text-[14px] leading-snug text-white">
      {imageUrl && <img src={imageUrl} alt="" className="max-h-64 w-full object-cover" />}
      <div className="px-3 py-2" dangerouslySetInnerHTML={{ __html: telegramHtml(text || "…") }} />
      {!!buttons?.length && (
        <div className="space-y-1 p-1 pt-0">
          {buttons.filter((b) => b.text.trim()).map((b, i) => (
            <div key={i} className="rounded-lg bg-white/10 py-1.5 text-center text-[13px] font-semibold">
              {b.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FormatBar({ target, onChange }: { target: React.RefObject<HTMLTextAreaElement | null>; onChange: (v: string) => void }) {
  const wrap = (open: string, close: string) => {
    const el = target.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b, value } = el;
    const next = value.slice(0, a) + open + value.slice(a, b) + close + value.slice(b);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + open.length, b + open.length);
    });
  };
  return (
    <div className="mb-1.5 flex gap-1.5">
      <button type="button" className={chip(false)} onClick={() => wrap("<b>", "</b>")}>
        <b>Ж</b>
      </button>
      <button type="button" className={chip(false)} onClick={() => wrap("<i>", "</i>")}>
        <i>К</i>
      </button>
      <button type="button" className={chip(false)} onClick={() => wrap('<a href="https://">', "</a>")}>
        Ссылка
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- рассылки

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const AUDIENCES: { kind: BroadcastAudience["kind"]; label: string }[] = [
  { kind: "all", label: "Все игроки" },
  { kind: "game", label: "По игре" },
  { kind: "recent", label: "Записывались недавно" },
  { kind: "events", label: "Участники ивентов" },
  { kind: "admins", label: "Администраторы" },
  { kind: "me", label: "Только мне" },
];

function scheduleLabel(s: BroadcastSchedule) {
  if (s.type === "now") return "Сразу после запуска";
  if (s.type === "once") return `Один раз: ${fmt(s.at)}`;
  const until = s.until ? `, до ${formatClub(`${s.until}T12:00:00+05:00`, { day: "numeric", month: "short" })}` : "";
  if (s.type === "weekly") return `Каждую неделю: ${s.days.map((d) => WEEKDAYS[d - 1]).join(", ")} в ${s.time}${until}`;
  return `Каждый месяц: ${s.day}-го в ${s.time}${until}`;
}

function audienceLabel(a: BroadcastAudience) {
  if (a.kind === "game") return `Игроки ${GAME_OPTIONS.find((g) => g.value === a.game)?.label ?? a.game}`;
  if (a.kind === "recent") return `Записывались за ${a.days ?? 30} дн.`;
  return AUDIENCES.find((x) => x.kind === a.kind)?.label ?? a.kind;
}

const STATUS: Record<Broadcast["status"], { label: string; cls: string }> = {
  draft: { label: "Черновик", cls: "bg-white/10 text-fg-2" },
  scheduled: { label: "Запланирована", cls: "bg-accent/20 text-accent" },
  paused: { label: "На паузе", cls: "bg-yellow-400/15 text-yellow-200" },
  done: { label: "Отправлена", cls: "bg-white/10 text-fg-2" },
};

const inAnHour = () => new Date(Date.now() + 3600_000).toISOString();

const EMPTY: BroadcastInput = { title: "", text: "", imageUrl: null, buttons: [], audience: { kind: "all" }, schedule: { type: "now" } };

function BroadcastsTab({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ["broadcasts"], queryFn: listBroadcasts });
  const [editing, setEditing] = useState<{ id: number | null; input: BroadcastInput } | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
  const act = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "start" | "pause" | "delete" }) =>
      action === "start" ? startBroadcast(id) : action === "pause" ? pauseBroadcast(id) : deleteBroadcast(id),
    onSuccess: refresh,
  });

  if (editing) return <BroadcastEditor initial={editing} onClose={() => (setEditing(null), refresh())} />;

  return (
    <div className="space-y-3">
      {canEdit && (
        <button type="button" className={clsx(btnPrimary, "w-full")} onClick={() => setEditing({ id: null, input: EMPTY })}>
          <Plus className="size-4" /> Новая рассылка
        </button>
      )}
      {list.isLoading && <p className="text-sm text-fg-3">Загружаем…</p>}
      {list.data?.length === 0 && <p className="text-sm text-fg-3">Рассылок пока нет.</p>}
      {act.isError && <p className="text-sm text-red-300">{(act.error as Error).message}</p>}
      {list.data?.map((b) => (
        <div key={b.id} className="rounded-2xl border border-white/10 bg-app-elevated p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold">{b.title}</p>
              <p className="mt-0.5 text-[13px] text-fg-2">{scheduleLabel(b.schedule)}</p>
              <p className="text-[13px] text-fg-3">Кому: {audienceLabel(b.audience)}</p>
            </div>
            <span className={clsx("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS[b.status].cls)}>{STATUS[b.status].label}</span>
          </div>
          <p className="mt-2 text-[12px] text-fg-3">
            {b.nextRunAt ? `Следующая: ${fmt(b.nextRunAt)} · ` : ""}
            {b.runs ? `Отправлялась: ${b.runs} раз, последний — ${fmt(b.lastRunAt)}, получателей: ${b.lastRecipients ?? 0}` : "Ещё не отправлялась"}
          </p>
          {canEdit && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={btnGhost} onClick={() => setEditing({ id: b.id, input: b })}>
                <Pencil className="size-4" /> Изменить
              </button>
              <button type="button" className={btnGhost} onClick={() => setEditing({ id: null, input: { ...b, title: `${b.title} (копия)` } })}>
                <Copy className="size-4" /> Копия
              </button>
              {b.status === "scheduled" ? (
                <button type="button" className={btnGhost} onClick={() => act.mutate({ id: b.id, action: "pause" })}>
                  <Pause className="size-4" /> Пауза
                </button>
              ) : (
                b.status !== "done" && (
                  <button type="button" className={btnGhost} onClick={() => act.mutate({ id: b.id, action: "start" })}>
                    <Play className="size-4" /> {b.schedule.type === "now" ? "Отправить" : "Запустить"}
                  </button>
                )
              )}
              <button
                type="button"
                className={clsx(btnGhost, "text-red-300")}
                onClick={() => window.confirm(`Удалить рассылку «${b.title}»?`) && act.mutate({ id: b.id, action: "delete" })}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function BroadcastEditor({ initial, onClose }: { initial: { id: number | null; input: BroadcastInput }; onClose: () => void }) {
  const [form, setForm] = useState<BroadcastInput>(initial.input);
  const [id, setId] = useState<number | null>(initial.id);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const set = (patch: Partial<BroadcastInput>) => setForm((f) => ({ ...f, ...patch }));
  const count = useQuery({ queryKey: ["audience", form.audience], queryFn: () => audienceSize(form.audience) });

  const save = async () => {
    const saved = id ? await updateBroadcast(id, form) : await createBroadcast(form);
    setId(saved.id);
    return saved;
  };
  const run = useMutation({
    mutationFn: async (action: "save" | "start" | "test") => {
      if (action === "test") return { kind: "test" as const, test: await testBroadcast(form) };
      const saved = await save();
      if (action === "start") return { kind: "started" as const, started: await startBroadcast(saved.id) };
      return { kind: "saved" as const, saved };
    },
    onSuccess: (r) => {
      if (r.kind === "test") setNote(r.test.ok ? { ok: true, text: "Тест отправлен вам в Telegram." } : { ok: false, text: `Не отправилось: ${r.test.error ?? ""}` });
      else if (r.kind === "started") {
        setNote({ ok: true, text: r.started.status === "done" ? `Поставлено в очередь: ${r.started.queued}` : `Запланировано: ${fmt(r.started.nextRunAt)}` });
        setTimeout(onClose, 900);
      } else setNote({ ok: true, text: "Черновик сохранён." });
    },
    onError: (e) => setNote({ ok: false, text: (e as Error).message }),
  });

  const s = form.schedule;
  const setSchedule = (type: BroadcastSchedule["type"]) =>
    set({
      schedule:
        type === "now"
          ? { type }
          : type === "once"
            ? { type, at: inAnHour() }
            : type === "weekly"
              ? { type, days: [5], time: "12:00", until: null }
              : { type, day: 1, time: "12:00", until: null },
    });
  const buttons = form.buttons ?? [];
  const setButton = (i: number, b: BroadcastButton) => set({ buttons: buttons.map((x, j) => (j === i ? b : x)) });
  const long = !!form.imageUrl && form.text.length > 1024;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{id ? "Рассылка" : "Новая рассылка"}</h2>
        <button type="button" aria-label="Закрыть" className={btnGhost} onClick={onClose}>
          <X className="size-4" />
        </button>
      </div>

      <label className="block">
        <span className="mb-1 block text-[13px] text-fg-3">Название (видите только вы)</span>
        <input className={input} value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Пятничная игра" />
      </label>

      <div>
        <span className="mb-1 block text-[13px] text-fg-3">Текст</span>
        <FormatBar target={textRef} onChange={(text) => set({ text })} />
        <textarea ref={textRef} className={clsx(input, "min-h-36")} value={form.text} onChange={(e) => set({ text: e.target.value })} />
        <p className={clsx("mt-1 text-[12px]", long ? "text-yellow-200" : "text-fg-3")}>
          {form.text.length} / {form.imageUrl ? "1024 с картинкой" : "4000"}
          {long ? " — картинка придёт отдельно, текст следом" : ""}
        </p>
      </div>

      <div>
        <span className="mb-1 block text-[13px] text-fg-3">Картинка</span>
        {form.imageUrl ? (
          <div className="flex items-center gap-3">
            <img src={form.imageUrl} alt="" className="size-20 rounded-xl object-cover" />
            <button type="button" className={btnGhost} onClick={() => set({ imageUrl: null })}>
              Убрать
            </button>
          </div>
        ) : (
          <label className={clsx(btnGhost, "cursor-pointer")}>
            {uploading ? <LoaderCircle className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
            Добавить картинку
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploading(true);
                try {
                  set({ imageUrl: (await uploadAdminFile(file, "notifications")).url });
                } catch (error) {
                  setNote({ ok: false, text: (error as Error).message });
                } finally {
                  setUploading(false);
                }
              }}
            />
          </label>
        )}
      </div>

      <div>
        <span className="mb-1 block text-[13px] text-fg-3">Кнопки под сообщением (до 3)</span>
        <div className="space-y-2">
          {buttons.map((b, i) => (
            <div key={i} className="rounded-xl border border-white/10 p-2.5">
              <div className="flex gap-2">
                <input className={input} value={b.text} placeholder="Текст кнопки" maxLength={40} onChange={(e) => setButton(i, { ...b, text: e.target.value })} />
                <button type="button" aria-label="Убрать кнопку" className={btnGhost} onClick={() => set({ buttons: buttons.filter((_, j) => j !== i) })}>
                  <X className="size-4" />
                </button>
              </div>
              <select
                className={clsx(input, "mt-2")}
                value={b.url !== undefined ? "url" : (b.path ?? "/")}
                onChange={(e) => setButton(i, e.target.value === "url" ? { text: b.text, url: "https://" } : { text: b.text, path: e.target.value })}
              >
                {BUTTON_TARGETS.map((t) => (
                  <option key={t.path} value={t.path}>
                    Открыть приложение: {t.label}
                  </option>
                ))}
                <option value="url">Ссылка на сайт…</option>
              </select>
              {b.url !== undefined && <input className={clsx(input, "mt-2")} value={b.url} onChange={(e) => setButton(i, { text: b.text, url: e.target.value })} />}
            </div>
          ))}
          {buttons.length < 3 && (
            <button type="button" className={btnGhost} onClick={() => set({ buttons: [...buttons, { text: "Открыть WarpHub", path: "/" }] })}>
              <Plus className="size-4" /> Кнопка
            </button>
          )}
        </div>
      </div>

      <div>
        <span className="mb-1 block text-[13px] text-fg-3">Кому</span>
        <select className={input} value={form.audience.kind} onChange={(e) => set({ audience: { kind: e.target.value as BroadcastAudience["kind"], game: "40k", days: 30 } })}>
          {AUDIENCES.map((a) => (
            <option key={a.kind} value={a.kind}>
              {a.label}
            </option>
          ))}
        </select>
        {form.audience.kind === "game" && (
          <select className={clsx(input, "mt-2")} value={form.audience.game ?? "40k"} onChange={(e) => set({ audience: { kind: "game", game: e.target.value } })}>
            {GAME_OPTIONS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        )}
        {form.audience.kind === "recent" && (
          <label className="mt-2 flex items-center gap-2 text-sm text-fg-2">
            за последние
            <input type="number" min={1} max={365} className={clsx(input, "w-24")} value={form.audience.days ?? 30} onChange={(e) => set({ audience: { kind: "recent", days: Number(e.target.value) || 30 } })} />
            дней
          </label>
        )}
        <p className="mt-1 text-[12px] text-fg-3">
          В аудитории: {count.data?.total ?? "…"} чел. Придёт тем, у кого не выключены «Новости и объявления» и кто может получать сообщения бота.
        </p>
      </div>

      <div>
        <span className="mb-1 block text-[13px] text-fg-3">Когда</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ["now", "Сразу"],
              ["once", "В заданное время"],
              ["weekly", "Каждую неделю"],
              ["monthly", "Каждый месяц"],
            ] as const
          ).map(([t, label]) => (
            <button key={t} type="button" className={chip(s.type === t)} onClick={() => setSchedule(t)}>
              {label}
            </button>
          ))}
        </div>
        {s.type === "once" && (
          <input type="datetime-local" className={clsx(input, "mt-2")} value={toClubDatetimeLocal(s.at)} onChange={(e) => set({ schedule: { type: "once", at: fromClubDatetimeLocal(e.target.value) } })} />
        )}
        {s.type === "weekly" && (
          <div className="mt-2 space-y-2">
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((d, i) => {
                const on = s.days.includes(i + 1);
                return (
                  <button key={d} type="button" className={clsx(chip(on), "px-0")} onClick={() => set({ schedule: { ...s, days: on ? s.days.filter((x) => x !== i + 1) : [...s.days, i + 1].sort() } })}>
                    {d}
                  </button>
                );
              })}
            </div>
            <ScheduleTime value={s} onChange={(next) => set({ schedule: next })} />
          </div>
        )}
        {s.type === "monthly" && (
          <div className="mt-2 space-y-2">
            <label className="flex items-center gap-2 text-sm text-fg-2">
              Число месяца
              <input type="number" min={1} max={31} className={clsx(input, "w-24")} value={s.day} onChange={(e) => set({ schedule: { ...s, day: Math.min(31, Math.max(1, Number(e.target.value) || 1)) } })} />
            </label>
            <ScheduleTime value={s} onChange={(next) => set({ schedule: next })} />
          </div>
        )}
        <p className="mt-1 text-[12px] text-fg-3">Время клуба. Ночью (тихие часы) сообщения ждут утра.</p>
      </div>

      <div>
        <span className="mb-1 block text-[13px] text-fg-3">Как увидят игроки</span>
        <Preview text={form.text} imageUrl={form.imageUrl} buttons={form.buttons} />
      </div>

      {note && <p className={clsx("text-sm", note.ok ? "text-accent" : "text-red-300")}>{note.text}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnGhost} disabled={run.isPending} onClick={() => run.mutate("test")}>
          <Send className="size-4" /> Тест себе
        </button>
        <button type="button" className={btnGhost} disabled={run.isPending} onClick={() => run.mutate("save")}>
          Сохранить черновик
        </button>
        <button
          type="button"
          className={btnPrimary}
          disabled={run.isPending}
          onClick={() =>
            window.confirm(s.type === "now" ? `Отправить сейчас? В аудитории: ${count.data?.total ?? "?"} чел.` : `Запустить по расписанию: ${scheduleLabel(s)}?`) &&
            run.mutate("start")
          }
        >
          {run.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}
          {s.type === "now" ? "Отправить" : "Запустить"}
        </button>
      </div>
    </div>
  );
}

function ScheduleTime({
  value,
  onChange,
}: {
  value: Extract<BroadcastSchedule, { type: "weekly" | "monthly" }>;
  onChange: (next: Extract<BroadcastSchedule, { type: "weekly" | "monthly" }>) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-fg-2">
      в
      <input type="time" className={clsx(input, "w-32")} value={value.time} onChange={(e) => onChange({ ...value, time: e.target.value })} />
      до
      <input type="date" className={clsx(input, "w-44")} value={value.until ?? ""} onChange={(e) => onChange({ ...value, until: e.target.value || null })} />
      <span className="text-[12px] text-fg-3">(пусто — без конца)</span>
    </div>
  );
}

// ---------------------------------------------------------------- автоматические

const GROUPS: { id: NotificationGroup; title: string }[] = [
  { id: "bookings", title: "Мои записи — игрокам" },
  { id: "match", title: "Поиск соперника" },
  { id: "content", title: "Новости и ивенты" },
  { id: "engagement", title: "Вовлечение" },
  { id: "admin", title: "Администраторам" },
];

function AutoTab({ catalog, loading }: { catalog?: NotificationCatalog; loading: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  if (loading || !catalog) return <p className="text-sm text-fg-3">Загружаем…</p>;
  return (
    <div className="space-y-5">
      {GROUPS.map((g) => (
        <section key={g.id}>
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-fg-3">{g.title}</h2>
          <div className="space-y-2">
            {catalog.kinds
              .filter((k) => k.group === g.id)
              .map((k) => (
                <KindCard key={k.id} kind={k} canEdit={catalog.canEdit} open={open === k.id} onToggle={() => setOpen(open === k.id ? null : k.id)} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function fill(text: string, vars: Record<string, string>) {
  return text
    .split("\n")
    .flatMap((line) => {
      let empty = false;
      const out = line.replace(/\{([^{}\n]+)\}/g, (m, k: string) => (k in vars ? (vars[k] ? vars[k]! : ((empty = true), "")) : m));
      return empty ? [] : [out];
    })
    .join("\n");
}

function KindCard({ kind, canEdit, open, onToggle }: { kind: NotificationKindView; canEdit: boolean; open: boolean; onToggle: () => void }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(kind.text ?? kind.defaultText);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const save = useMutation({
    mutationFn: (input: { enabled?: boolean; text?: string | null }) => saveNotificationTemplate(kind.id, input),
    onSuccess: () => (queryClient.invalidateQueries({ queryKey: ["notification-catalog"] }), setNote({ ok: true, text: "Сохранено." })),
    onError: (e) => setNote({ ok: false, text: (e as Error).message }),
  });
  const test = useMutation({
    mutationFn: () => testNotificationTemplate(kind.id, text),
    onSuccess: (r) => setNote(r.ok ? { ok: true, text: "Тест отправлен вам (с примерами вместо переменных)." } : { ok: false, text: r.error ?? "Не отправилось" }),
  });
  const custom = kind.text !== null;
  const insert = (v: string) => {
    const el = ref.current;
    const pos = el?.selectionStart ?? text.length;
    setText(text.slice(0, pos) + `{${v}}` + text.slice(pos));
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-app-elevated">
      <div className="flex items-center gap-3 p-3.5">
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
          <span className="block text-sm font-semibold">
            {kind.title}
            {custom && <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] text-accent">свой текст</span>}
          </span>
          <span className="mt-0.5 block text-[12px] text-fg-3">{kind.when}</span>
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={kind.enabled}
          aria-label={kind.enabled ? "Выключить" : "Включить"}
          disabled={!canEdit || save.isPending}
          onClick={() => save.mutate({ enabled: !kind.enabled })}
          className={clsx("flex h-[30px] w-[50px] shrink-0 items-center rounded-full p-[3px] disabled:opacity-50", kind.enabled ? "justify-end bg-accent" : "justify-start bg-white/[0.14]")}
        >
          <span className={clsx("size-6 rounded-full", kind.enabled ? "bg-accent-foreground" : "bg-fg")} />
        </button>
      </div>
      {open && (
        <div className="space-y-3 border-t border-white/10 p-3.5">
          {canEdit && <FormatBar target={ref} onChange={setText} />}
          <textarea ref={ref} className={clsx(input, "min-h-32 font-mono text-[13px]")} value={text} readOnly={!canEdit} onChange={(e) => setText(e.target.value)} />
          {!!Object.keys(kind.vars).length && (
            <div>
              <p className="mb-1 text-[12px] text-fg-3">Переменные (нажмите, чтобы вставить). Строка с пустой переменной не показывается.</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(kind.vars).map((v) => (
                  <button key={v} type="button" disabled={!canEdit} className="rounded-lg bg-white/10 px-2 py-1 text-[12px] text-fg-2" onClick={() => insert(v)}>
                    {`{${v}}`}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="mb-1 text-[12px] text-fg-3">Пример</p>
            <Preview text={fill(text, kind.vars)} />
          </div>
          <CardPreview kind={kind.id} text={text} />
          {note && <p className={clsx("text-sm", note.ok ? "text-accent" : "text-red-300")}>{note.text}</p>}
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnPrimary} disabled={save.isPending} onClick={() => save.mutate({ text: text.trim() === kind.defaultText.trim() ? null : text })}>
                Сохранить
              </button>
              <button type="button" className={btnGhost} disabled={test.isPending} onClick={() => test.mutate()}>
                <Send className="size-4" /> Тест себе
              </button>
              {custom && (
                <button type="button" className={btnGhost} onClick={() => (setText(kind.defaultText), save.mutate({ text: null }))}>
                  Вернуть стандартный
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Картинка уведомления (14.11.2026): так её увидит игрок — с примерами вместо переменных. */
function CardPreview({ kind, text }: { kind: string; text: string }) {
  const preview = useMutation({ mutationFn: () => previewNotificationImage(kind, text) });
  return (
    <div>
      <button type="button" className={btnGhost} disabled={preview.isPending} onClick={() => preview.mutate()}>
        {preview.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
        {preview.data ? "Обновить картинку" : "Показать картинку"}
      </button>
      {preview.isError && <p className="mt-2 text-sm text-red-300">{(preview.error as Error).message}</p>}
      {preview.data && (
        <div className="mt-2 max-w-sm overflow-hidden rounded-2xl rounded-bl-md bg-[#2b5278]/40">
          {preview.data.format === "mp4" ? (
            <video src={preview.data.image} autoPlay loop muted playsInline className="w-full" aria-label="Анимация уведомления" />
          ) : (
            <img src={preview.data.image} alt="Картинка уведомления" className="w-full" />
          )}
          <div className="px-3 py-2 text-[14px] leading-snug text-white" dangerouslySetInnerHTML={{ __html: telegramHtml(preview.data.caption) }} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- журнал

function why(r: { ok: boolean; reason: string | null; status: number | null; description: string | null }) {
  if (r.ok) return "доставлено";
  if (r.reason === "disabled") return "уведомления выключены на сервере";
  if (r.reason === "network") return "нет связи с Telegram";
  if (r.status === 403) return "не нажимал «Старт» / заблокировал бота";
  return r.description ?? `ошибка ${r.status ?? ""}`;
}

function LogTab({ catalog }: { catalog?: NotificationCatalog }) {
  const [kind, setKind] = useState("");
  const log = useQuery({ queryKey: ["notification-log", kind], queryFn: () => getNotificationLog(kind || undefined), refetchInterval: 30_000 });
  const titles = useMemo(() => new Map((catalog?.kinds ?? []).map((k) => [k.id, k.title])), [catalog]);
  const title = (k: string) => titles.get(k) ?? (k === "broadcast" ? "Рассылка" : k.startsWith("test") ? "Проверка" : k);
  return (
    <div className="space-y-3">
      <select className={input} value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="">Все типы</option>
        <option value="broadcast">Рассылки</option>
        {catalog?.kinds.map((k) => (
          <option key={k.id} value={k.id}>
            {k.title}
          </option>
        ))}
      </select>
      {log.data && (
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ["За сутки", `${log.data.day.delivered} / ${log.data.day.sent}`],
            ["За неделю", `${log.data.week.delivered} / ${log.data.week.sent}`],
            ["В очереди", String(log.data.queued)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-white/10 bg-app-elevated p-2.5">
              <p className="text-lg font-semibold">{value}</p>
              <p className="text-[11px] text-fg-3">{label}</p>
            </div>
          ))}
        </div>
      )}
      <p className="text-[12px] text-fg-3">«Доставлено / отправлено». В очереди — объявления, которые ждут утра или своей очереди.</p>
      {log.isLoading && <p className="text-sm text-fg-3">Загружаем…</p>}
      <ul className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-app-elevated">
        {log.data?.rows.map((r) => (
          <li key={r.id} className="px-3 py-2.5 text-[13px]">
            <span className="text-fg-3">{fmt(r.at)}</span> · <span className="font-semibold">{title(r.kind)}</span> · {r.telegramId}
            <span className={clsx("block", r.ok ? "text-fg-2" : "text-red-300")}>{why(r)}</span>
          </li>
        ))}
        {log.data?.rows.length === 0 && <li className="px-3 py-6 text-center text-sm text-fg-3">Отправок пока нет.</li>}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- настройки

function SettingsTab({ catalog }: { catalog?: NotificationCatalog }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<NotificationConfig | null>(null);
  const value = form ?? catalog?.config;
  const save = useMutation({
    mutationFn: saveNotificationConfig,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notification-catalog"] }),
  });
  if (!value) return <p className="text-sm text-fg-3">Загружаем…</p>;
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const canEdit = catalog?.canEdit ?? false;
  const images = value.images ?? true;
  const animated = value.animated ?? true;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-app-elevated p-3.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Картинки вместо текста</p>
          <p className="mt-0.5 text-[12px] text-fg-3">
            Уведомления приходят картинкой в стиле WarpHub: на ней крупно главное (игра, дата, стол), весь текст — в подписи под ней. Картинка собирается из текста уведомления — правка текста меняет и её. Ваши рассылки отправляются как есть.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={images}
          aria-label="Картинки вместо текста"
          disabled={!canEdit}
          onClick={() => setForm({ ...value, images: !images })}
          className={clsx("flex h-[30px] w-[50px] shrink-0 items-center rounded-full p-[3px] disabled:opacity-50", images ? "justify-end bg-accent" : "justify-start bg-white/[0.14]")}
        >
          <span className={clsx("size-6 rounded-full", images ? "bg-accent-foreground" : "bg-fg")} />
        </button>
      </div>
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-app-elevated p-3.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Анимация</p>
          <p className="mt-0.5 text-[12px] text-fg-3">Узор на картинке двигается (в Telegram проигрывается сама, по кругу). Выключите — придёт обычная картинка.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={animated}
          aria-label="Анимация картинок"
          disabled={!canEdit || !images}
          onClick={() => setForm({ ...value, animated: !animated })}
          className={clsx("flex h-[30px] w-[50px] shrink-0 items-center rounded-full p-[3px] disabled:opacity-50", animated ? "justify-end bg-accent" : "justify-start bg-white/[0.14]")}
        >
          <span className={clsx("size-6 rounded-full", animated ? "bg-accent-foreground" : "bg-fg")} />
        </button>
      </div>
      <div className="rounded-2xl border border-white/10 bg-app-elevated p-3.5">
        <p className="text-sm font-semibold">Тихие часы</p>
        <p className="mt-0.5 text-[12px] text-fg-3">Объявления (поиск соперника, новости, рассылки) в это время ждут утра. Личные уведомления о записях приходят всегда.</p>
        <div className="mt-2 flex items-center gap-2 text-sm text-fg-2">
          с
          <select disabled={!canEdit} className={clsx(input, "w-24")} value={value.quietFrom} onChange={(e) => setForm({ ...value, quietFrom: Number(e.target.value) })}>
            {hours.map((h) => (
              <option key={h} value={h}>{`${h}:00`}</option>
            ))}
          </select>
          до
          <select disabled={!canEdit} className={clsx(input, "w-24")} value={value.quietTo} onChange={(e) => setForm({ ...value, quietTo: Number(e.target.value) })}>
            {hours.map((h) => (
              <option key={h} value={h}>{`${h}:00`}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-app-elevated p-3.5">
        <p className="text-sm font-semibold">Автоматических объявлений в день одному игроку</p>
        <p className="mt-0.5 text-[12px] text-fg-3">Поиск соперника, новости, ивенты, ранги. Ваши рассылки в лимит не входят.</p>
        <input
          type="number"
          min={0}
          max={20}
          disabled={!canEdit}
          className={clsx(input, "mt-2 w-24")}
          value={value.dailyLimit}
          onChange={(e) => setForm({ ...value, dailyLimit: Math.max(0, Math.min(20, Number(e.target.value) || 0)) })}
        />
      </div>
      {canEdit && (
        <button type="button" className={btnPrimary} disabled={!form || save.isPending} onClick={() => form && save.mutate(form)}>
          {save.isPending && <LoaderCircle className="size-4 animate-spin" />} Сохранить
        </button>
      )}
      {save.isSuccess && !form && <p className="text-sm text-accent">Сохранено.</p>}
      {save.isError && <p className="text-sm text-red-300">{(save.error as Error).message}</p>}
    </div>
  );
}
