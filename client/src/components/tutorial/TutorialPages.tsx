import { DsButton, SectionLabel } from "@/components/ui/ds";
import { useTelegramBack } from "@/hooks/useTelegramBack";
import { useRegistrationStageStore } from "@/stores/useRegistrationStageStore";
import { useReservationStore } from "@/stores/useReservationStore";
import { haptic } from "@/utils/haptic";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, List, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { TUTORIAL_GAMES, TUTORIAL_SOON, tutorialOf, type TutorialStep } from "./content";
import TutorialDiagramView from "./TutorialDiagram";

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
        <section className="rounded-[20px] border border-accent/30 bg-gradient-to-br from-accent/[0.18] to-accent/[0.02] p-5">
          <h1 className="font-display text-[28px] font-semibold uppercase leading-[1.05]">
            Первая игра
            <br />
            без паники
          </h1>
          <p className="mt-2 text-[15px] leading-snug text-fg-2">Короткие карточки со схемами: как устроен ход, как стрелять и драться.</p>
        </section>

        <section>
          <SectionLabel>Выберите игру</SectionLabel>
          <div className="overflow-hidden rounded-[18px] border border-white/10 bg-app-elevated">
            {TUTORIAL_GAMES.map((game, i) => (
              <button
                key={game.id}
                type="button"
                onClick={() => (haptic.tap(), navigate(`/learn/${game.id}`))}
                className={clsx("flex min-h-[72px] w-full items-center gap-3.5 px-4 py-3 text-left active:bg-white/[0.06]", i > 0 && "border-t border-white/[0.06]")}
              >
                <span className="font-display flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-base font-bold text-accent-foreground">{game.code}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold">{game.title}</span>
                  <span className="block text-[13px] text-fg-2">
                    {game.steps.length} шагов · около {Math.max(3, Math.round(game.steps.length / 2))} мин
                  </span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-accent" />
              </button>
            ))}
            {TUTORIAL_SOON.map((game) => (
              <div key={game.code} className="flex min-h-[72px] items-center gap-3.5 border-t border-white/[0.06] px-4 py-3 opacity-70">
                <span className="font-display flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] text-base font-bold text-fg-2">{game.code}</span>
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
    <article className="flex flex-col gap-4">
      <header>
        <div className="flex items-center gap-3">
          <h1 className="font-display text-[30px] font-semibold uppercase leading-[1.05]">{step.title}</h1>
          {step.phase && <Diamond tone="accent">{step.phase}</Diamond>}
        </div>
        <p className="mt-0.5 text-sm text-fg-3">
          {step.en}
          {step.phase ? ` · фаза ${step.phase}` : ""}
        </p>
      </header>
      <TutorialDiagramView diagram={step.diagram} />
      <ul className="flex flex-col gap-2.5">
        {step.points.map((point) => (
          <li key={point} className="flex gap-2.5 text-[15px] leading-snug text-fg-2">
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
            <DsButton variant="primary" size="lg" className="w-full" onClick={bookTraining}>
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
