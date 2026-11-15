import { DsButton, LimeHero, SectionLabel } from "@/components/ui/ds";
import { useTelegramBack } from "@/hooks/useTelegramBack";
import { useRegistrationStageStore } from "@/stores/useRegistrationStageStore";
import { useReservationStore } from "@/stores/useReservationStore";
import { haptic } from "@/utils/haptic";
import clsx from "clsx";
import { Check, ChevronLeft, ChevronRight, List, RotateCcw, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { TUTORIAL_GAMES, TUTORIAL_SOON, tutorialOf, type TutorialStep } from "./content";
import { learnDone, markLearnDone } from "./progress";
import TutorialDiagramView from "./TutorialDiagram";
import { TUTORIAL_WALKS, type WalkStep } from "./walkthrough";

/** Назад: на прошлый экран, если он в истории приложения; иначе — на запасной адрес. */
function useBack(fallback: string) {
  const navigate = useNavigate();
  const location = useLocation();
  return () => (location.key !== "default" ? navigate(-1) : navigate(fallback, { replace: true }));
}

function TopBar({ onBack, kicker, title, right }: { onBack: () => void; kicker?: string; title: string; right?: ReactNode }) {
  useTelegramBack(onBack);
  return (
    <div className="sticky top-0 z-20 flex h-[64px] items-center gap-3 bg-app-bg/95 px-4 backdrop-blur">
      <button
        type="button"
        onClick={() => (haptic.tap(), onBack())}
        aria-label="Назад"
        className="ds-press flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.14] bg-app-elevated text-fg"
      >
        <ChevronLeft className="size-5" />
      </button>
      <div className="min-w-0 flex-1">
        {kicker && <p className="truncate text-[12px] font-bold uppercase tracking-[0.08em] text-fg-3">{kicker}</p>}
        <p className="truncate text-[15px] font-semibold text-fg">{title}</p>
      </div>
      {right}
    </div>
  );
}

/** «Как играть»: список игр (задача 2, 30.10.2026). Открывается с главной, из профиля и из WarpBuilder. */
export function TutorialHub() {
  const navigate = useNavigate();
  const back = useBack("/profile");
  return (
    <div className="ds-enter pb-10 text-fg">
      <TopBar onBack={back} title="Как играть" />
      <div className="flex flex-col gap-5 px-5 pt-1">
        {/* лаймовый концепт (15.11.2026): тот же блок — лаймовым, с червяками */}
        <LimeHero title="Первая игра без паники" size="sm">
          <p className="text-[14px] leading-snug">Карточки со схемами: ход, стрельба, бой. После карточек откроется обучающая игра — раунд по шагам за столом.</p>
        </LimeHero>

        <section>
          <SectionLabel>Выберите игру</SectionLabel>
          <div className="overflow-hidden rounded-[18px] border border-white/10 bg-app-elevated">
            {TUTORIAL_GAMES.map((game, i) => {
              const walk = TUTORIAL_WALKS[game.id];
              const done = learnDone(game.id);
              return (
                <div key={game.id} className={clsx(i > 0 && "border-t border-white/[0.06]")}>
                  <button
                    type="button"
                    onClick={() => (haptic.tap(), navigate(`/learn/${game.id}`))}
                    className="flex min-h-[60px] w-full items-center gap-3 px-3.5 py-2.5 text-left active:bg-white/[0.06]"
                  >
                    <span className="font-display flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-[15px] font-bold text-accent-foreground">{game.code}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-bold leading-tight">{game.title}</span>
                      <span className="block text-[12.5px] text-fg-2">
                        {done ? "Пройдено · " : ""}
                        {game.steps.length} шагов · около {Math.max(3, Math.round(game.steps.length / 2))} мин
                      </span>
                    </span>
                    {done ? <Check className="size-5 shrink-0 text-accent" /> : <ChevronRight className="size-5 shrink-0 text-accent" />}
                  </button>
                  {/* обучающая игра — только после карточек «Как играть» этой игры (13.11.2026) */}
                  {walk &&
                    (done ? (
                      <button
                        type="button"
                        onClick={() => (haptic.tap(), navigate(`/learn/${game.id}/round`))}
                        className="flex min-h-[44px] w-full items-center gap-3 border-t border-white/[0.06] bg-accent/[0.06] py-2 pl-[66px] pr-3.5 text-left active:bg-white/[0.06]"
                      >
                        <span className="min-w-0 flex-1 text-[13.5px] font-semibold text-accent">Обучающая игра: раунд по шагам · {walk.steps.length} шагов</span>
                        <ChevronRight className="size-4 shrink-0 text-accent" />
                      </button>
                    ) : null)}
                </div>
              );
            })}
            {TUTORIAL_SOON.map((game) => (
              <div key={game.code} className="flex min-h-[56px] items-center gap-3 border-t border-white/[0.06] px-3.5 py-2 opacity-70">
                <span className="font-display flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] text-base font-bold text-fg-2">{game.code}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold">{game.title}</span>
                  <span className="block text-[13px] text-fg-3">Скоро</span>
                </span>
              </div>
            ))}
          </div>
        </section>
        <p className="text-[13px] leading-snug text-fg-3">Правила пересказаны кратко. Источник и редакция — на последней карточке.</p>
      </div>
    </div>
  );
}

/** Текст пункта: **жирный** — термин. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
        part.startsWith("**") ? (
          <b key={i} className="font-bold text-fg">
            {part.slice(2, -2)}
          </b>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

function Diamond({ children, tone }: { children: ReactNode; tone: "accent" | "danger" }) {
  return (
    <span
      aria-hidden="true"
      className={clsx(
        "flex size-6 shrink-0 rotate-45 items-center justify-center rounded-[5px]",
        tone === "accent" ? "bg-accent text-accent-foreground" : "bg-danger text-[#111]",
      )}
    >
      <span className="-rotate-45 text-[13px] font-extrabold">{children}</span>
    </span>
  );
}

function StepCard({ step }: { step: TutorialStep }) {
  return (
    <article className="flex flex-col gap-3">
      <header>
        <div className="flex items-center gap-2.5">
          <h1 className="font-display text-[24px] font-semibold uppercase leading-[1.05]">{step.title}</h1>
          {step.phase && <Diamond tone="accent">{step.phase}</Diamond>}
        </div>
        <p className="mt-0.5 text-sm text-fg-3">
          {step.en}
          {step.phase ? ` · фаза ${step.phase}` : ""}
        </p>
      </header>
      <TutorialDiagramView diagram={step.diagram} />
      <ul className="flex flex-col gap-2">
        {step.points.map((point) => (
          <li key={point} className="flex gap-2.5 text-[14.5px] leading-snug text-fg-2">
            <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-[2px] bg-accent" />
            <span>
              <Rich text={point} />
            </span>
          </li>
        ))}
      </ul>
      {step.note && (
        <div className="flex items-start gap-3 rounded-[14px] border border-danger/35 bg-danger/10 px-4 py-3">
          <Diamond tone="danger">!</Diamond>
          <p className="text-[14px] leading-snug text-fg">{step.note}</p>
        </div>
      )}
    </article>
  );
}

/** Карточки обучения одной игры: листание свайпом и кнопками, переход к любому шагу через список. */
export function TutorialViewer() {
  const { game: gameId } = useParams();
  const game = tutorialOf(gameId);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [listOpen, setListOpen] = useState(false);
  const back = useBack("/learn");
  const { resetStages, nextStage } = useRegistrationStageStore();
  const { setDisciplineId } = useReservationStore();

  const total = game?.steps.length ?? 0;
  const step = Math.min(Math.max(Number(params.get("step") ?? 1) || 1, 1), Math.max(total, 1)) - 1;
  const go = (index: number) => {
    if (index < 0 || index >= total || index === step) return;
    haptic.select();
    setParams({ step: String(index + 1) }, { replace: true });
  };

  // свайп влево/вправо по карточке
  const touch = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    document.querySelector<HTMLElement>("[data-tutorial-top]")?.scrollIntoView({ block: "start" });
  }, [step]);

  const reachedEnd = !!game && step === total - 1;
  useEffect(() => {
    if (game && reachedEnd) markLearnDone(game.id);
  }, [game, reachedEnd]);

  if (!game) return <Navigate to="/learn" replace />;
  const current = game.steps[step]!;
  const last = step === total - 1;

  const bookTraining = () => {
    resetStages();
    setDisciplineId(null);
    nextStage();
    navigate("/");
  };

  return (
    <div className="pb-[calc(96px+env(safe-area-inset-bottom))] text-fg" data-tutorial-top>
      <TopBar
        onBack={() => (listOpen ? setListOpen(false) : back())}
        kicker={`Как играть · ${game.code}`}
        title={`Шаг ${step + 1} из ${total}`}
        right={
          <button
            type="button"
            onClick={() => (haptic.tap(), setListOpen(true))}
            aria-label="Все шаги"
            className="ds-press flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.14] bg-app-elevated text-fg"
          >
            <List className="size-5" />
          </button>
        }
      />
      <div className="flex gap-1 px-4 pb-3" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step + 1}>
        {game.steps.map((s, i) => (
          <span key={s.title} className={clsx("h-1 flex-1 rounded-full transition-colors", i <= step ? "bg-accent" : "bg-white/[0.14]")} />
        ))}
      </div>

      <div
        key={step}
        className="ds-enter px-5 pt-1"
        onTouchStart={(event) => {
          const t = event.touches[0]!;
          touch.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={(event) => {
          const start = touch.current;
          touch.current = null;
          const t = event.changedTouches[0];
          if (!start || !t) return;
          const dx = t.clientX - start.x;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(t.clientY - start.y) * 1.5) go(dx < 0 ? step + 1 : step - 1);
        }}
      >
        <StepCard step={current} />
        {last && (
          <div className="mt-5 flex flex-col gap-2.5">
            {TUTORIAL_WALKS[game.id] && (
              <DsButton variant="primary" size="lg" className="w-full" onClick={() => (haptic.tap(), navigate(`/learn/${game.id}/round`))}>
                Обучающая игра: раунд по шагам
              </DsButton>
            )}
            <DsButton variant={TUTORIAL_WALKS[game.id] ? "secondary" : "primary"} size="lg" className="w-full" onClick={bookTraining}>
              Записаться на тренировку
            </DsButton>
            <p className="text-[13px] leading-snug text-fg-3">{game.source}</p>
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/[0.08] bg-app-bg/95 px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-xl gap-2.5">
          <DsButton size="lg" className="flex-1" disabled={step === 0} onClick={() => go(step - 1)}>
            Назад
          </DsButton>
          {last ? (
            <DsButton size="lg" className="flex-[2]" onClick={() => (haptic.ok(), back())}>
              Готово
            </DsButton>
          ) : (
            <DsButton variant="primary" size="lg" className="flex-[2]" onClick={() => go(step + 1)}>
              Далее
            </DsButton>
          )}
        </div>
      </div>

      {listOpen && (
        <div className="fixed inset-0 z-[60]">
          <div className="ds-fade absolute inset-0 bg-black/60" onClick={() => setListOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Шаги обучения"
            className="ds-sheet absolute inset-x-0 bottom-0 mx-auto flex max-h-[85dvh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-t-[22px] border-t border-white/10 bg-app-elevated px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-2.5"
          >
            <div className="h-1 w-10 shrink-0 self-center rounded bg-white/20" />
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-[22px] font-semibold uppercase leading-none">Шаги</h2>
              <button type="button" onClick={() => setListOpen(false)} aria-label="Закрыть" className="ds-press flex size-11 items-center justify-center rounded-xl border border-white/[0.14]">
                <X className="size-5" />
              </button>
            </div>
            <div className="overflow-hidden rounded-[14px] bg-field">
              {game.steps.map((s, i) => (
                <button
                  key={s.title}
                  type="button"
                  aria-current={i === step ? "step" : undefined}
                  onClick={() => {
                    go(i);
                    setListOpen(false);
                  }}
                  className={clsx(
                    "flex min-h-[56px] w-full items-center gap-3 border-t border-white/[0.05] px-3.5 py-2 text-left first:border-t-0 active:bg-white/[0.06]",
                    i === step && "bg-accent/10",
                  )}
                >
                  <span className={clsx("w-6 shrink-0 text-center text-sm font-bold", i <= step ? "text-accent" : "text-fg-3")}>{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold">{s.title}</span>
                    <span className="block text-[13px] text-fg-2">{s.en}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- «Учебный раунд» (07.11.2026) ----------

const ROUND_KEY = (game: string) => `warphub:learn-round:${game}`;
const readDone = (game: string): number[] => {
  try {
    const v = JSON.parse(localStorage.getItem(ROUND_KEY(game)) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => Number.isInteger(x)) : [];
  } catch {
    return [];
  }
};
const writeDone = (game: string, done: number[]) => {
  try {
    localStorage.setItem(ROUND_KEY(game), JSON.stringify(done));
  } catch {
    // приватный режим — отметки живут до закрытия
  }
};

function WalkCard({ step, n }: { step: WalkStep; n: number }) {
  return (
    <article className="flex flex-col gap-4">
      <header>
        <div className="flex items-center gap-3">
          <h1 className="font-display text-[28px] font-semibold uppercase leading-[1.05]">{step.title}</h1>
          {step.phase && <Diamond tone="accent">{step.phase}</Diamond>}
        </div>
        <p className="mt-0.5 text-sm text-fg-3">
          Шаг {n} · {step.en}
        </p>
      </header>
      {step.diagram && <TutorialDiagramView diagram={step.diagram} />}
      <section>
        <SectionLabel>Сделайте на столе</SectionLabel>
        <ol className="flex flex-col gap-2.5">
          {step.doIt.map((line, i) => (
            <li key={line} className="flex gap-3 text-[15px] leading-snug text-fg-2">
              <span className="font-display flex size-6 shrink-0 items-center justify-center rounded-md bg-accent/15 text-[13px] font-semibold text-accent">{i + 1}</span>
              <span className="pt-0.5">
                <Rich text={line} />
              </span>
            </li>
          ))}
        </ol>
      </section>
      {step.example && (
        <div className="rounded-[14px] border border-white/10 bg-field px-4 py-3">
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-accent">{step.example.title}</p>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {step.example.lines.map((line) => (
              <li key={line} className="text-[14px] leading-snug text-fg-2">
                <Rich text={line} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {step.mistake && (
        <div className="flex items-start gap-3 rounded-[14px] border border-danger/35 bg-danger/10 px-4 py-3">
          <Diamond tone="danger">!</Diamond>
          <p className="text-[14px] leading-snug text-fg">
            <span className="font-semibold">Частая ошибка. </span>
            {step.mistake}
          </p>
        </div>
      )}
      {step.app && <p className="text-[13px] leading-snug text-fg-3">В приложении: {step.app}</p>}
    </article>
  );
}

/**
 * Учебный раунд: подготовка и один раунд игры по шагам (что сделать на столе, пример с кубиками, частая ошибка).
 * «Сделано» отмечает шаг (запоминается на телефоне); в конце — что меняется в следующем раунде и «Повторить раунд».
 */
export function TutorialRound() {
  const { game: gameId } = useParams();
  const game = tutorialOf(gameId);
  const walk = game ? TUTORIAL_WALKS[game.id] : undefined;
  const [params, setParams] = useSearchParams();
  const back = useBack(game ? `/learn/${game.id}` : "/learn");
  const [done, setDone] = useState<number[]>(() => (game ? readDone(game.id) : []));
  const pageParam = params.get("p");
  useEffect(() => {
    document.querySelector<HTMLElement>("[data-tutorial-top]")?.scrollIntoView({ block: "start" });
  }, [pageParam]);
  if (!game || !walk) return <Navigate to="/learn" replace />;
  // обучающая игра — после карточек «Как играть» (13.11.2026)
  if (!learnDone(game.id)) return <Navigate to={`/learn/${game.id}`} replace />;
  // 0 — вступление (примеры отрядов), 1..N — шаги, N+1 — следующий раунд
  const total = walk.steps.length + 2;
  const page = Math.min(Math.max(Number(params.get("p") ?? 0) || 0, 0), total - 1);
  const go = (p: number) => {
    if (p < 0 || p >= total) return;
    haptic.select();
    setParams({ p: String(p) }, { replace: true });
  };
  const mark = (i: number, on: boolean) => {
    const next = on ? [...new Set([...done, i])] : done.filter((x) => x !== i);
    setDone(next);
    writeDone(game.id, next);
  };
  const stepIndex = page - 1;
  const isStep = page >= 1 && page <= walk.steps.length;
  const last = page === total - 1;
  const restart = () => {
    haptic.ok();
    setDone([]);
    writeDone(game.id, []);
    setParams({ p: "1" }, { replace: true });
  };

  return (
    <div className="pb-[calc(96px+env(safe-area-inset-bottom))] text-fg" data-tutorial-top>
      <TopBar onBack={back} kicker={`Обучающая игра · ${game.code}`} title={page === 0 ? game.title : last ? "Следующий раунд" : `Шаг ${page} из ${walk.steps.length}`} />
      <div className="flex gap-1 px-4 pb-3" role="progressbar" aria-valuemin={0} aria-valuemax={walk.steps.length} aria-valuenow={done.length}>
        {walk.steps.map((s, i) => (
          <span key={s.title} className={clsx("h-1 flex-1 rounded-full transition-colors", done.includes(i) ? "bg-accent" : i === stepIndex ? "bg-accent/50" : "bg-white/[0.14]")} />
        ))}
      </div>
      <div key={page} className="ds-enter flex flex-col gap-4 px-5 pt-1">
        {page === 0 && (
          <>
            <h1 className="font-display text-[30px] font-semibold uppercase leading-[1.05]">Сыграем раунд</h1>
            <p className="text-[15px] leading-snug text-fg-2">{walk.intro}</p>
            <div className="rounded-[14px] border border-white/10 bg-field px-4 py-3">
              <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-accent">{walk.sample.title}</p>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {walk.sample.lines.map((line) => (
                  <li key={line} className="text-[14px] leading-snug text-fg-2">
                    <Rich text={line} />
                  </li>
                ))}
              </ul>
            </div>
            <section>
              <SectionLabel>Шаги</SectionLabel>
              <div className="overflow-hidden rounded-[14px] bg-field">
                {walk.steps.map((s, i) => (
                  <button
                    key={s.title}
                    type="button"
                    onClick={() => go(i + 1)}
                    className="flex min-h-[52px] w-full items-center gap-3 border-t border-white/[0.05] px-3.5 py-2 text-left first:border-t-0 active:bg-white/[0.06]"
                  >
                    <span className={clsx("flex size-6 shrink-0 items-center justify-center rounded-md text-[13px] font-bold", done.includes(i) ? "bg-accent text-accent-foreground" : "text-fg-3")}>
                      {done.includes(i) ? <Check className="size-4" /> : i + 1}
                    </span>
                    <span className="min-w-0 flex-1 text-[15px] font-semibold">{s.title}</span>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
        {isStep && (
          <>
            <WalkCard step={walk.steps[stepIndex]!} n={page} />
            <button
              type="button"
              role="switch"
              aria-checked={done.includes(stepIndex)}
              onClick={() => (haptic.select(), mark(stepIndex, !done.includes(stepIndex)))}
              className={clsx(
                "flex min-h-[52px] items-center gap-3 rounded-[14px] border px-4 text-left text-[15px] font-semibold",
                done.includes(stepIndex) ? "border-accent bg-accent/10 text-accent" : "border-white/[0.14] text-fg-2",
              )}
            >
              <span className={clsx("flex size-6 items-center justify-center rounded-md border", done.includes(stepIndex) ? "border-accent bg-accent text-accent-foreground" : "border-white/30")}>
                {done.includes(stepIndex) && <Check className="size-4" />}
              </span>
              Сделано на столе
            </button>
          </>
        )}
        {last && (
          <>
            <h1 className="font-display text-[30px] font-semibold uppercase leading-[1.05]">Следующий раунд</h1>
            <p className="text-[15px] leading-snug text-fg-2">
              Пройдено шагов: {done.length} из {walk.steps.length}. Дальше играйте так же — вот что меняется:
            </p>
            <ul className="flex flex-col gap-2.5">
              {walk.repeat.map((line) => (
                <li key={line} className="flex gap-2.5 text-[15px] leading-snug text-fg-2">
                  <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-[2px] bg-accent" />
                  <span>
                    <Rich text={line} />
                  </span>
                </li>
              ))}
            </ul>
            <DsButton size="lg" className="w-full" onClick={restart}>
              <RotateCcw className="size-4" /> Повторить раунд
            </DsButton>
            <p className="text-[13px] leading-snug text-fg-3">{walk.source}</p>
          </>
        )}
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/[0.08] bg-app-bg/95 px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-xl gap-2.5">
          <DsButton size="lg" className="flex-1" disabled={page === 0} onClick={() => go(page - 1)}>
            Назад
          </DsButton>
          {last ? (
            <DsButton size="lg" className="flex-[2]" onClick={() => (haptic.ok(), back())}>
              Готово
            </DsButton>
          ) : (
            <DsButton
              variant="primary"
              size="lg"
              className="flex-[2]"
              onClick={() => {
                if (isStep && !done.includes(stepIndex)) mark(stepIndex, true);
                go(page + 1);
              }}
            >
              {page === 0 ? "Начать" : "Сделано · далее"}
            </DsButton>
          )}
        </div>
      </div>
    </div>
  );
}
