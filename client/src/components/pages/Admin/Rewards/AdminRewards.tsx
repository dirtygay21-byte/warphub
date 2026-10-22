import {
  findAdminRewards,
  GAME_TITLES,
  getMinigameSettings,
  getMinigameStats,
  redeemAdminReward,
  REWARD_STATUS_LABELS,
  REWARD_TYPE_LABELS,
  saveMinigameSettings,
  type AdminReward,
  type MinigameKey,
  type MinigameSettings,
  type CardRarity,
  type AdminPlayerPoints,
  findPlayersPoints,
  adjustPlayerPoints,
  getPlayerPoints,
  type RewardStatus,
  type RewardType,
} from "@/apiUtils/minigames";
import { formatClub } from "@/utils/clubTime";
import { userLabel } from "@/utils/user";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { CheckCircle2, LoaderCircle, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";

const TABS = [
  { id: "check", label: "Проверить код" },
  { id: "list", label: "Все награды" },
  { id: "points", label: "Очки игроков" },
  { id: "settings", label: "Настройки" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const input =
  "w-full rounded-lg border border-white/10 bg-app-subtle px-3 py-2.5 text-sm text-white outline-none focus:border-accent/60";

export default function AdminRewards() {
  const [tab, setTab] = useState<TabId>("check");
  return (
    <div className="px-4 py-3 pb-28 text-white sm:px-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Награды мини-игр</h1>
        <p className="mt-1 text-sm text-white/50">
          Проверка кодов, отметка использования и таблицы наград
        </p>
      </div>
      <div className="mb-5 flex gap-2 overflow-x-auto [scrollbar-width:none]">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={clsx(
              "shrink-0 rounded-lg px-3 py-2 text-xs font-semibold sm:text-sm",
              tab === item.id
                ? "bg-accent text-accent-foreground"
                : "border border-white/10 bg-white/3 text-white/80 active:bg-white/10",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === "check" && <CheckTab />}
      {tab === "list" && <ListTab />}
      {tab === "points" && <PointsTab />}
      {tab === "settings" && <SettingsTab />}
    </div>
  );
}

const STATUS_STYLE: Record<RewardStatus, string> = {
  active: "bg-accent/20 text-accent",
  used: "bg-white/10 text-white/60",
  expired: "bg-[#b13e53]/25 text-[#ff9db0]",
};

function RewardRow({ reward }: { reward: AdminReward }) {
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const redeem = useMutation({
    mutationFn: () => redeemAdminReward(reward.id),
    onSuccess: () => {
      setConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["admin", "rewards"] });
    },
  });

  return (
    <div className="rounded-xl border border-white/10 bg-app-elevated p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-lg font-bold tracking-widest text-accent">{reward.code}</p>
          <p className="mt-1 text-base font-semibold">{reward.label}</p>
          <p className="text-xs text-white/55">
            {reward.gameTitle} · результат {reward.score}
          </p>
        </div>
        <span className={clsx("shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold", STATUS_STYLE[reward.status])}>
          {REWARD_STATUS_LABELS[reward.status]}
        </span>
      </div>
      <p className="mt-2 text-sm text-white/80">{userLabel(reward.user)}</p>
      <p className="mt-1 text-xs text-white/50">
        Получена {formatClub(reward.createdAt, { day: "numeric", month: "short" })} · действует до{" "}
        {formatClub(reward.expiresAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        {reward.usedAt && ` · использована ${formatClub(reward.usedAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
      </p>

      {reward.status === "active" &&
        (confirm ? (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => redeem.mutate()}
              disabled={redeem.isPending}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-60"
            >
              {redeem.isPending && <LoaderCircle className="size-4 animate-spin" />}
              Да, применить скидку
            </button>
            <button
              type="button"
              onClick={() => setConfirm(false)}
              className="rounded-lg border border-white/10 px-4 text-sm"
            >
              Отмена
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirm(true)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-accent/60 py-2.5 text-sm font-semibold text-accent"
          >
            <CheckCircle2 className="size-4" /> Отметить использованной
          </button>
        ))}
      {redeem.isError && <p className="mt-2 text-sm text-[#ff9db0]">{(redeem.error as Error).message}</p>}
    </div>
  );
}

function CheckTab() {
  const [code, setCode] = useState("");
  const [submitted, setSubmitted] = useState("");
  const query = useQuery({
    queryKey: ["admin", "rewards", "code", submitted],
    queryFn: () => findAdminRewards({ code: submitted }),
    enabled: submitted.length > 0,
  });

  return (
    <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(code.trim());
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="WH-XXXXXX"
          className={clsx(input, "font-mono tracking-widest")}
          autoCapitalize="characters"
        />
        <button
          type="submit"
          className="flex shrink-0 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground"
        >
          <Search className="size-4" /> Найти
        </button>
      </form>
      <p className="text-xs text-white/45">Можно вводить без «WH-», регистр не важен.</p>
      {query.isFetching && <LoaderCircle className="size-6 animate-spin text-accent" />}
      {query.isError && <p className="text-sm text-[#ff9db0]">{(query.error as Error).message}</p>}
      {query.data && query.data.length === 0 && (
        <p className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-white/60">
          Код не найден. Проверьте, нет ли опечатки.
        </p>
      )}
      {query.data?.map((reward) => <RewardRow key={reward.id} reward={reward} />)}
      <Stats />
    </div>
  );
}

function Stats() {
  const stats = useQuery({ queryKey: ["admin", "rewards", "stats"], queryFn: getMinigameStats });
  if (!stats.data) return null;
  return (
    <div className="mt-6 rounded-xl border border-white/10 bg-white/3 p-4">
      <p className="mb-2 text-sm font-semibold">Неделя {stats.data.weekKey}</p>
      <div className="space-y-1 text-xs text-white/70">
        {stats.data.games.map((g) => (
          <p key={g.key}>
            {g.title}: игр за 7 дней — {g.playsLast7Days}, наград на этой неделе — {g.rewardsThisWeek}
          </p>
        ))}
        <p className="text-white/45">Отклонено подозрительных результатов за 7 дней: {stats.data.rejectedLast7Days}</p>
      </div>
    </div>
  );
}

function ListTab() {
  const [status, setStatus] = useState<RewardStatus | "all">("active");
  const query = useQuery({
    queryKey: ["admin", "rewards", "list", status],
    queryFn: () => findAdminRewards({ status: status === "all" ? undefined : status }),
  });
  const filters: Array<[RewardStatus | "all", string]> = [
    ["active", "Активные"],
    ["used", "Использованные"],
    ["expired", "Истёкшие"],
    ["all", "Все"],
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {filters.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setStatus(id)}
            className={clsx(
              "rounded-md px-2.5 py-1.5 text-xs",
              status === id ? "bg-white/15 text-white" : "text-white/55",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {query.isLoading && <LoaderCircle className="size-6 animate-spin text-accent" />}
      {query.data?.length === 0 && <p className="text-sm text-white/50">Пусто.</p>}
      {query.data?.map((reward) => <RewardRow key={reward.id} reward={reward} />)}
    </div>
  );
}

const GAME_KEYS: Array<Exclude<MinigameKey, "cards">> = ["runner", "dice", "egg"];
const SCORE_UNITS: Record<Exclude<MinigameKey, "cards">, string> = { runner: "метров", dice: "побед", egg: "нажатий" };
const RARITY_NAMES: Record<CardRarity, string> = {
  common: "Обычная",
  uncommon: "Необычная",
  rare: "Редкая",
  epic: "Эпическая",
  legendary: "Легендарная",
};

function NumberField({
  label,
  value,
  onChange,
  step = 1,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-white/60">{label}</span>
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(Number(e.target.value))}
        className={clsx(input, "mt-1")}
      />
      {hint && <span className="mt-1 block text-[11px] text-white/40">{hint}</span>}
    </label>
  );
}

function SettingsTab() {
  const query = useQuery({ queryKey: ["admin", "minigames", "settings"], queryFn: getMinigameSettings });
  if (!query.data) return <LoaderCircle className="size-6 animate-spin text-accent" />;
  return <SettingsForm initial={query.data} />;
}

function SettingsForm({ initial }: { initial: MinigameSettings }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<MinigameSettings>(() => structuredClone(initial));
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: (settings: MinigameSettings) => saveMinigameSettings(settings),
    onSuccess: (data) => {
      setDraft(structuredClone(data));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      queryClient.invalidateQueries({ queryKey: ["admin", "minigames", "settings"] });
      queryClient.invalidateQueries({ queryKey: ["minigames"] });
    },
  });

  const update = (fn: (d: MinigameSettings) => void) => {
    const next = structuredClone(draft);
    fn(next);
    setDraft(next);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-white/10 bg-app-elevated p-4">
        <NumberField
          label="Срок действия награды, дней"
          value={draft.rewardValidDays}
          onChange={(v) => update((d) => void (d.rewardValidDays = v))}
        />
        <NumberField
          label="Попыток в день на игру"
          value={draft.maxSessionsPerDay}
          onChange={(v) => update((d) => void (d.maxSessionsPerDay = v))}
          hint="Защита от перебора"
        />
      </div>

      {GAME_KEYS.map((key) => {
        const g = draft.games[key];
        return (
          <section key={key} className="rounded-xl border border-white/10 bg-app-elevated p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">{GAME_TITLES[key]}</h3>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={g.enabled}
                  onChange={(e) => update((d) => void (d.games[key].enabled = e.target.checked))}
                  className="size-4 accent-[rgb(236,254,70)]"
                />
                Включена
              </label>
            </div>

            <p className="mb-2 text-xs text-white/50">
              Награда по результату (от скольких {SCORE_UNITS[key]}). Ниже первого порога — без награды.
            </p>
            <div className="space-y-2">
              {g.tiers.map((tier, index) => (
                <div key={index} className="grid grid-cols-[1fr_1.4fr_1fr_auto] items-center gap-2">
                  <input
                    type="number"
                    value={tier.minScore}
                    onChange={(e) =>
                      update((d) => void (d.games[key].tiers[index]!.minScore = Number(e.target.value)))
                    }
                    className={input}
                    aria-label="Порог"
                  />
                  <select
                    value={tier.rewardType}
                    onChange={(e) =>
                      update((d) => void (d.games[key].tiers[index]!.rewardType = e.target.value as RewardType))
                    }
                    className={input}
                  >
                    {Object.entries(REWARD_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={tier.value}
                    onChange={(e) =>
                      update((d) => void (d.games[key].tiers[index]!.value = Number(e.target.value)))
                    }
                    className={input}
                    aria-label="Значение"
                  />
                  <button
                    type="button"
                    onClick={() => update((d) => void d.games[key].tiers.splice(index, 1))}
                    className="p-2 text-white/50"
                    aria-label="Удалить уровень"
                  >
                    <Trash2 className="size-4" />
                  </button>
                  {tier.rewardType === "badge" && (
                    <input
                      value={tier.label ?? ""}
                      placeholder="Название значка"
                      onChange={(e) =>
                        update((d) => void (d.games[key].tiers[index]!.label = e.target.value))
                      }
                      className={clsx(input, "col-span-4")}
                    />
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                update((d) => {
                  const last = d.games[key].tiers.at(-1);
                  d.games[key].tiers.push({
                    minScore: (last?.minScore ?? 0) + 1,
                    rewardType: "percent_discount",
                    value: (last?.value ?? 0) + 1,
                  });
                })
              }
              className="mt-2 flex items-center gap-1.5 text-sm text-accent"
            >
              <Plus className="size-4" /> Добавить уровень
            </button>

            {key === "egg" && (
              <div className="mt-4">
                <NumberField
                  label="Время на нажатия, секунд"
                  value={draft.games.egg.params.durationSec}
                  onChange={(v) => update((d) => void (d.games.egg.params.durationSec = v))}
                />
              </div>
            )}
            {key === "dice" && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <NumberField
                  label="Бонус за победу на последнем издыхании, %"
                  value={draft.games.dice.params.clutchBonusPercent}
                  onChange={(v) => update((d) => void (d.games.dice.params.clutchBonusPercent = v))}
                />
                <NumberField
                  label="Лечение после победы, ран"
                  value={draft.games.dice.params.healAfterWin}
                  onChange={(v) => update((d) => void (d.games.dice.params.healAfterWin = v))}
                />
              </div>
            )}
          </section>
        );
      })}

      <section className="rounded-xl border border-white/10 bg-app-elevated p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">{GAME_TITLES.cards}</h3>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.games.cards.enabled}
              onChange={(e) => update((d) => void (d.games.cards.enabled = e.target.checked))}
              className="size-4 accent-[rgb(236,254,70)]"
            />
            Включена
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Пакетов в день"
            value={draft.games.cards.params.packsPerDay}
            onChange={(v) => update((d) => void (d.games.cards.params.packsPerDay = v))}
          />
          <NumberField
            label="Карт в пакете"
            value={draft.games.cards.params.cardsPerPack}
            onChange={(v) => update((d) => void (d.games.cards.params.cardsPerPack = v))}
          />
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-white/80">
          <input
            type="checkbox"
            checked={draft.games.cards.params.guaranteeUncommon}
            onChange={(e) => update((d) => void (d.games.cards.params.guaranteeUncommon = e.target.checked))}
            className="size-4 accent-[rgb(236,254,70)]"
          />
          В каждом пакете хотя бы одна «Необычная» или лучше
        </label>
        <p className="mb-2 mt-4 text-xs text-white/50">Шанс (вес) выпадения и очки за каждую редкость</p>
        <div className="space-y-2">
          {(Object.keys(RARITY_NAMES) as CardRarity[]).map((r) => {
            const total = (Object.keys(RARITY_NAMES) as CardRarity[]).reduce((sum, k) => sum + draft.games.cards.params.rarities[k].weight, 0) || 1;
            const pct = Math.round((draft.games.cards.params.rarities[r].weight / total) * 1000) / 10;
            return (
              <div key={r} className="grid grid-cols-[1.3fr_1fr_1fr] items-center gap-2">
                <span className="text-sm">
                  {RARITY_NAMES[r]} <span className="text-xs text-white/40">{pct}%</span>
                </span>
                <input
                  type="number"
                  value={draft.games.cards.params.rarities[r].weight}
                  onChange={(e) => update((d) => void (d.games.cards.params.rarities[r].weight = Number(e.target.value)))}
                  className={input}
                  aria-label={`Вес: ${RARITY_NAMES[r]}`}
                />
                <input
                  type="number"
                  value={draft.games.cards.params.rarities[r].points}
                  onChange={(e) => update((d) => void (d.games.cards.params.rarities[r].points = Number(e.target.value)))}
                  className={input}
                  aria-label={`Очки: ${RARITY_NAMES[r]}`}
                />
              </div>
            );
          })}
          <p className="text-[11px] text-white/40">Столбцы: вес шанса · очки за карту</p>
        </div>
      </section>

      {save.isError && <p className="text-sm text-[#ff9db0]">{(save.error as Error).message}</p>}
      <button
        type="button"
        onClick={() => save.mutate(draft)}
        disabled={save.isPending}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3.5 text-sm font-semibold text-accent-foreground disabled:opacity-60"
      >
        {save.isPending && <LoaderCircle className="size-4 animate-spin" />}
        {saved ? "Сохранено ✓" : "Сохранить настройки"}
      </button>
      <p className="text-xs text-white/45">
        Изменения действуют для новых попыток. Уже выданные награды не меняются.
      </p>
    </div>
  );
}

function PointsTab() {
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const query = useQuery({
    queryKey: ["admin", "points", submitted],
    queryFn: () => findPlayersPoints(submitted),
    enabled: submitted.length > 0,
  });
  return (
    <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(q.trim());
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="@username или Telegram ID" className={input} />
        <button type="submit" className="flex shrink-0 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground">
          <Search className="size-4" /> Найти
        </button>
      </form>
      <p className="text-xs text-white/45">Очки игроки получают за карты «Легенд Warp Hub». Здесь их можно списать (например, в счёт скидки) или начислить.</p>
      {query.isFetching && <LoaderCircle className="size-6 animate-spin text-accent" />}
      {query.data && query.data.length === 0 && <p className="text-sm text-white/50">Никого не нашли.</p>}
      {query.data?.map((player) => <PlayerPoints key={player.id} player={player} />)}
    </div>
  );
}

function PlayerPoints({ player }: { player: AdminPlayerPoints }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const history = useQuery({ queryKey: ["admin", "points", "history", player.id], queryFn: () => getPlayerPoints(player.id) });
  const adjust = useMutation({
    mutationFn: (delta: number) => adjustPlayerPoints(player.id, delta, note),
    onSuccess: () => {
      setAmount("");
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["admin", "points"] });
    },
  });
  const balance = history.data?.balance ?? player.balance;
  const value = Math.floor(Number(amount));
  return (
    <div className="rounded-xl border border-white/10 bg-app-elevated p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{userLabel(player)}</p>
          <p className="text-xs text-white/50">
            Карт: {player.totalCards} (разных {player.uniqueCards})
          </p>
        </div>
        <p className="text-2xl font-semibold text-accent">{balance.toLocaleString("ru-RU")}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Сколько очков" className={input} />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="За что (необязательно)" className={input} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!value || value <= 0 || adjust.isPending}
          onClick={() => adjust.mutate(-value)}
          className="rounded-lg bg-accent py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-40"
        >
          Списать
        </button>
        <button
          type="button"
          disabled={!value || value <= 0 || adjust.isPending}
          onClick={() => adjust.mutate(value)}
          className="rounded-lg border border-white/15 py-2.5 text-sm disabled:opacity-40"
        >
          Начислить
        </button>
      </div>
      {adjust.isError && <p className="mt-2 text-sm text-[#ff9db0]">{(adjust.error as Error).message}</p>}
      {history.data && history.data.history.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-white/10 pt-2 text-xs text-white/60">
          {history.data.history.slice(0, 6).map((h) => (
            <li key={h.id} className="flex justify-between gap-2">
              <span className="truncate">
                {formatClub(h.createdAt, { day: "numeric", month: "short" })} · {h.note ?? h.reason}
              </span>
              <span className={h.delta > 0 ? "text-accent" : "text-[#ff8a80]"}>
                {h.delta > 0 ? "+" : ""}
                {h.delta}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
