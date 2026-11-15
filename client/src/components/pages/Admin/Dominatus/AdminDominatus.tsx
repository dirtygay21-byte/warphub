import {
  adminCreateCampaign,
  adminDominatus,
  adminFinishCampaign,
  adminPreviewPhaseEnd,
  adminRemoveDominatusPlayer,
  adminResolvePhase,
  adminSearchDominatusPlayers,
  adminSetDominatusPlayer,
  adminStartPhase,
} from "@/apiUtils/dominatus";
import { inputClassName } from "@/components/booking/FormControls";
import { ALLIANCE_RU, hasCampaign, type CampaignView } from "@/features/roster/dominatus/api";
import type { AllianceId } from "@/features/roster/dominatus/types";
import { haptic } from "@/utils/haptic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { LoaderCircle, Search } from "lucide-react";
import { useState, type ReactNode } from "react";

const ALLIANCES: AllianceId[] = ["liberators", "oppressors", "raiders"];
const KEY = ["admin-dominatus"];
/** Бросок D6 Warmaster для локации фазы (вне компонента: случайность только по нажатию). */
const rollD6 = () => 1 + Math.floor(Math.random() * 6);
const card = "rounded-[16px] border border-white/10 bg-app-elevated p-4";
const chip = (on: boolean) =>
  clsx("ds-press min-h-11 rounded-xl border px-3 text-[14px] font-semibold disabled:opacity-60", on ? "border-accent bg-accent text-accent-foreground" : "border-white/[0.14] bg-field text-fg");

/** Мутация Warmaster: после успеха — перечитать кампанию. */
function useAction<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { success: "Готово" },
    mutationFn: (args: A) => fn(...args),
    onSuccess: () => {
      haptic.ok();
      queryClient.invalidateQueries({ queryKey: KEY });
    },
  });
}

/**
 * Dominatus (DM2): администратор — Warmaster кампании. Создать кампанию, добавить игроков и альянсы, начать фазу
 * (бросок D6 или выбор локации), завершить фазу (контроль, Ascendancy, Narrative Points, Relics), завершить кампанию.
 */
export default function AdminDominatus() {
  const q = useQuery({ queryKey: KEY, queryFn: adminDominatus });
  return (
    <div className="px-4 py-3 pb-28 text-fg sm:px-6">
      <h1 className="font-display text-[28px] font-bold uppercase leading-none">Dominatus</h1>
      <p className="mt-1 text-sm text-fg-2">Нарративная кампания 40K. Вы — Warmaster: игроки, альянсы, фазы. Битвы записывают игроки в «Начать игру».</p>
      {q.isLoading ? (
        <LoaderCircle className="mt-6 size-6 animate-spin text-accent" />
      ) : q.isError ? (
        <p className="mt-6 text-sm text-danger">Не удалось загрузить: {q.error.message}</p>
      ) : hasCampaign(q.data ?? null) ? (
        <Campaign view={q.data as CampaignView} />
      ) : (
        <CreateCampaign />
      )}
    </div>
  );
}

function Err({ error }: { error: Error | null }) {
  return error ? <p className="mt-2 text-[13px] text-danger">{error.message}</p> : null;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function CreateCampaign() {
  const [name, setName] = useState("");
  const create = useAction(adminCreateCampaign);
  return (
    <div className={clsx(card, "mt-5")}>
      <p className="text-sm text-fg-2">Активной кампании нет.</p>
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Название кампании" className={clsx(inputClassName, "mt-3")} />
      <button type="button" disabled={!name.trim() || create.isPending} onClick={() => create.mutate([name.trim()])} className={clsx(chip(true), "mt-3 w-full")}>
        Создать кампанию
      </button>
      <Err error={create.error} />
    </div>
  );
}

function Campaign({ view }: { view: CampaignView }) {
  const open = view.phases.find((p) => p.status === "open") ?? null;
  const next = open ? null : view.phases.length < 3 ? view.phases.length + 1 : null;
  return (
    <>
      <div className={clsx(card, "mt-5")}>
        <p className="text-base font-semibold">{view.campaign.name}</p>
        <p className="mt-1 text-[13px] text-fg-3">
          {open ? `Идёт фаза ${open.phase} · ${open.location?.name ?? "—"}` : view.phases.length ? `Завершено фаз: ${view.phases.length} из 3` : "Фазы ещё не начинались"} · игроков{" "}
          {view.players.length} · битв {view.battles.length}
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[13px]">
          {ALLIANCES.map((a) => (
            <div key={a} className="rounded-xl border border-white/10 p-2">
              <p className="font-semibold">{ALLIANCE_RU[a]}</p>
              <p className="text-fg-3">
                NP {view.standings[a].narrative} · H {view.standings[a].phaseHonours}/{view.standings[a].honours}
              </p>
            </div>
          ))}
        </div>
      </div>
      {open && <EndPhase phase={open.phase} />}
      {next && <StartPhase view={view} phase={next} />}
      <Players view={view} />
      {!open && <Finish />}
    </>
  );
}

function StartPhase({ view, phase }: { view: CampaignView; phase: number }) {
  const locations = view.catalog.locations.filter((l) => l.phase === phase);
  const [roll, setRoll] = useState<number | null>(null);
  const [loc, setLoc] = useState<string | null>(null);
  const start = useAction(adminStartPhase);
  const doRoll = () => {
    const value = rollD6();
    setRoll(value);
    setLoc(locations.find((l) => value >= l.rolls[0] && value <= l.rolls[1])?.id ?? null);
    haptic.ok();
  };
  return (
    <Section title={`Начать фазу ${phase}`}>
      <div className={card}>
        <p className="text-[13px] text-fg-2">Локация — броском D6 (1–2 / 3–4 / 5–6) или выбором Warmaster (бонус локации прошлой фазы может дать выбор).</p>
        <div className="mt-3 space-y-2">
          {locations.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => {
                setLoc(l.id);
                setRoll(null);
              }}
              className={clsx(chip(loc === l.id), "flex w-full items-baseline justify-between text-left")}
            >
              <span>{l.name}</span>
              <span className="text-[12px] opacity-70">
                {l.rolls[0]}–{l.rolls[1]} · {l.bonus}
              </span>
            </button>
          ))}
        </div>
        <button type="button" onClick={doRoll} className={clsx(chip(false), "mt-2 w-full")}>
          {roll ? `Выпало ${roll} — бросить ещё раз` : "Бросить D6"}
        </button>
        <button type="button" disabled={!loc || start.isPending} onClick={() => start.mutate([phase, loc!, roll])} className={clsx(chip(true), "mt-2 w-full")}>
          Начать фазу {phase}
        </button>
        <Err error={start.error} />
      </div>
    </Section>
  );
}

function EndPhase({ phase }: { phase: number }) {
  const [pick, setPick] = useState<AllianceId | null>(null);
  const [show, setShow] = useState(false);
  const preview = useQuery({ queryKey: [...KEY, "end", pick], queryFn: () => adminPreviewPhaseEnd(pick), enabled: show });
  const resolve = useAction(adminResolvePhase);
  const o = preview.data;
  const list = (xs: AllianceId[]) => (xs.length ? xs.map((a) => ALLIANCE_RU[a]).join(", ") : "никто");
  return (
    <Section title={`Завершить фазу ${phase}`}>
      <div className={card}>
        {!show ? (
          <button type="button" onClick={() => setShow(true)} className={clsx(chip(false), "w-full")}>
            Показать итог фазы
          </button>
        ) : preview.isLoading ? (
          <LoaderCircle className="size-6 animate-spin text-accent" />
        ) : o ? (
          <div className="space-y-2 text-sm">
            <p>
              Контроль локации: <b>{o.controller ? ALLIANCE_RU[o.controller] : o.tied.length ? "ничья — решает Warmaster" : "никто (нет Battle Honour)"}</b>
            </p>
            {o.tied.length > 1 && (
              <div className="grid grid-cols-3 gap-2">
                {o.tied.map((a) => (
                  <button key={a} type="button" onClick={() => setPick(a)} className={chip(pick === a)}>
                    {ALLIANCE_RU[a]}
                  </button>
                ))}
              </div>
            )}
            <p>Ascendancy: {list(o.ascendant)}</p>
            <p>
              Narrative Points:{" "}
              {Object.entries(o.narrative).length
                ? Object.entries(o.narrative)
                    .map(([a, n]) => `${ALLIANCE_RU[a as AllianceId]} +${n}`)
                    .join(", ")
                : "нет"}
            </p>
            {o.relics.length > 0 && <p>Relics к выбору: {o.relics.map((r) => `${r.name} (тянуть ${r.draw})`).join(", ")}</p>}
            <p className="text-[12px] text-fg-3">После завершения все Agenda Achieved сбрасываются.</p>
            <button
              type="button"
              disabled={resolve.isPending || (o.tied.length > 1 && !o.controller)}
              onClick={() => resolve.mutate([pick], { onSuccess: () => setShow(false) })}
              className={clsx(chip(true), "w-full")}
            >
              Завершить фазу {phase}
            </button>
            <Err error={resolve.error} />
          </div>
        ) : (
          <Err error={preview.error} />
        )}
      </div>
    </Section>
  );
}

function Players({ view }: { view: CampaignView }) {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const search = useQuery({ queryKey: [...KEY, "search", query], queryFn: () => adminSearchDominatusPlayers(query), enabled: query.length > 0 });
  const set = useAction(adminSetDominatusPlayer);
  const remove = useAction(adminRemoveDominatusPlayer);
  const allianceOf = new Map(view.players.filter((p) => p.username).map((p) => [p.username!, p.alliance]));
  const allianceRow = (current: AllianceId | null, onPick: (a: AllianceId) => void) => (
    <div className="mt-2 grid grid-cols-3 gap-2">
      {ALLIANCES.map((a) => (
        <button key={a} type="button" disabled={set.isPending} onClick={() => a !== current && onPick(a)} className={chip(a === current)}>
          {ALLIANCE_RU[a]}
        </button>
      ))}
    </div>
  );
  return (
    <Section title="Игроки">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q.trim());
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="@username или Telegram ID" className={inputClassName} aria-label="Найти игрока" />
        <button type="submit" aria-label="Найти" className="ds-press flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <Search className="size-5" />
        </button>
      </form>
      {query && (
        <div className="mt-3 space-y-3">
          {search.isLoading ? (
            <LoaderCircle className="size-6 animate-spin text-accent" />
          ) : (search.data ?? []).length === 0 ? (
            <p className="text-sm text-fg-2">Никого не нашли. Игрок должен хотя бы раз открыть приложение.</p>
          ) : (
            search.data!.map((row) => (
              <article key={row.user.id} className={card}>
                <p className="font-semibold">
                  {[row.user.firstName, row.user.lastName].filter(Boolean).join(" ")}
                  {row.user.username ? ` · @${row.user.username}` : ""}
                </p>
                <p className="text-[13px] text-fg-3">{allianceOf.has(row.user.username ?? "") ? "В кампании — сменить альянс:" : "Добавить в кампанию:"}</p>
                {allianceRow(allianceOf.get(row.user.username ?? "") ?? null, (a) => set.mutate([row.user.id, a]))}
              </article>
            ))
          )}
        </div>
      )}
      <div className="mt-4 space-y-2">
        {view.players.length === 0 && <p className="text-sm text-fg-2">Игроков пока нет.</p>}
        {view.players.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm">
            <span className="min-w-0">
              <b>{p.name}</b>
              {p.username ? <span className="text-fg-3"> @{p.username}</span> : null}
              <span className="block text-[12px] text-fg-3">{ALLIANCE_RU[p.alliance]}</span>
            </span>
            <button type="button" disabled={remove.isPending} onClick={() => remove.mutate([p.id])} className="ds-press shrink-0 text-[13px] text-fg-3 underline">
              Убрать
            </button>
          </div>
        ))}
        <Err error={(set.error ?? remove.error) as Error | null} />
        <p className="text-[12px] text-fg-3">Сменить альянс — найдите игрока и выберите альянс. Игрока с битвами убрать нельзя.</p>
      </div>
    </Section>
  );
}

function Finish() {
  const [winner, setWinner] = useState<AllianceId | null>(null);
  const [sure, setSure] = useState(false);
  const finish = useAction(adminFinishCampaign);
  return (
    <Section title="Завершить кампанию">
      <div className={card}>
        <p className="text-[13px] text-fg-2">Победителя кампании объявляет Warmaster (по Narrative Points и сюжету). Можно без победителя.</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {ALLIANCES.map((a) => (
            <button key={a} type="button" onClick={() => setWinner(winner === a ? null : a)} className={chip(winner === a)}>
              {ALLIANCE_RU[a]}
            </button>
          ))}
        </div>
        {!sure ? (
          <button type="button" onClick={() => setSure(true)} className={clsx(chip(false), "mt-3 w-full")}>
            Завершить кампанию…
          </button>
        ) : (
          <button type="button" disabled={finish.isPending} onClick={() => finish.mutate([winner])} className={clsx(chip(true), "mt-3 w-full")}>
            Да, завершить{winner ? ` — победа ${ALLIANCE_RU[winner]}` : " без победителя"}
          </button>
        )}
        <Err error={finish.error} />
      </div>
    </Section>
  );
}
