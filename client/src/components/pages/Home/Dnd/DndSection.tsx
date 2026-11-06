import {
  bookDndGame,
  createTrialRequest,
  DND_MASTER_CONTACT,
  flexibleLabel,
  getDndGames,
  type DndGame,
} from "@/apiUtils/dnd";
import {
  ChoiceChips,
  Field,
  inputClassName,
  MultiChoiceChips,
  NumberChips,
  YesNoChips,
} from "@/components/booking/FormControls";
import { useBookingOptions } from "@/hooks/useBookingOptions";
import { useRegistrationStageStore } from "@/stores/useRegistrationStageStore";
import { useReservationStore } from "@/stores/useReservationStore";
import { formatClub, formatClubTimeRange } from "@/utils/clubTime";
import { s3Url } from "@/utils/s3utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/ds";

type View =
  | { name: "home" }
  | { name: "trial" }
  | { name: "join"; game: DndGame }
  | { name: "done"; kind: "trial" | "join"; game?: DndGame };

export default function DndSection({
  initialView = "home",
}: {
  initialView?: "home" | "trial";
}) {
  const [view, setView] = useState<View>(
    initialView === "trial" ? { name: "trial" } : { name: "home" },
  );

  return (
    <div className="w-full px-6 py-3 pb-10 text-white">
      {view.name === "home" && (
        <DndHome
          onTrial={() => setView({ name: "trial" })}
          onJoin={(game) => setView({ name: "join", game })}
        />
      )}
      {view.name === "trial" && (
        <TrialForm
          onBack={() => setView({ name: "home" })}
          onDone={() => setView({ name: "done", kind: "trial" })}
        />
      )}
      {view.name === "join" && (
        <JoinForm
          game={view.game}
          onBack={() => setView({ name: "home" })}
          onDone={() => setView({ name: "done", kind: "join", game: view.game })}
        />
      )}
      {view.name === "done" && <DndDone kind={view.kind} game={view.game} />}
    </div>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-fg-2 active:text-white"
    >
      <ChevronLeft className="size-4" />
      Назад к D&D
    </button>
  );
}

const gameImage = (game: DndGame) =>
  game.imageUrl || s3Url("services/dnd_game.webp");

const formatGameDate = (game: DndGame) =>
  game.startsAt
    ? formatClub(game.startsAt, { weekday: "short", day: "numeric", month: "long" })
    : flexibleLabel(game);

/** Время: точное — «18:00–22:00»; у игры без точного времени — его уточнит Мастер */
const formatGameTime = (game: DndGame) =>
  game.startsAt ? formatClubTimeRange(game.startsAt, game.endsAt) : "Точное время уточнит Мастер";

function availabilityLabel(game: DndGame) {
  if (game.status === "closed") return "Запись закрыта";
  if (game.available <= 0) return "Мест нет";
  return `Свободно мест: ${game.available} из ${game.capacity}`;
}

function DndHome({
  onTrial,
  onJoin,
}: {
  onTrial: () => void;
  onJoin: (game: DndGame) => void;
}) {
  const gamesQuery = useQuery({ queryKey: ["dnd-games"], queryFn: getDndGames });
  const games = gamesQuery.data ?? [];

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-accent/40 bg-app-elevated p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Sparkles className="size-5" />
          </span>
          <div>
            <h2 className="text-xl font-semibold">Хочу попробовать</h2>
            <p className="mt-1 text-sm text-fg-2">
              Никогда не играли или хотите собрать свою компанию? Оставьте
              заявку без даты — мы подберём группу и предложим удобную игру.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onTrial}
          className="mt-4 w-full rounded-xl bg-accent px-4 py-3.5 text-base font-semibold text-accent-foreground transition-transform active:scale-95"
        >
          Оставить заявку
        </button>
      </section>

      <section>
        <h2 className="mb-1 text-2xl font-medium">Игры по расписанию</h2>
        <p className="mb-3 text-sm text-fg-3">
          Конкретная игра с датой и временем — запишитесь сами или с друзьями.
        </p>

        {gamesQuery.isLoading ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Загружаем игры">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-[88px] rounded-xl" />
            ))}
          </div>
        ) : gamesQuery.isError ? (
          <p className="rounded-xl border border-white/10 bg-app-elevated px-4 py-5 text-sm text-fg-2">
            Не удалось загрузить игры. Попробуйте позже.
          </p>
        ) : games.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-app-elevated px-4 py-5 text-sm text-fg-2">
            Ближайших игр пока нет. Оставьте заявку «Хочу попробовать» — мы
            сообщим, когда соберём группу.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {games.map((game) => (
              <DndGameCard key={game.id} game={game} onJoin={() => onJoin(game)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function DndGameCard({
  game,
  onJoin,
}: {
  game: DndGame;
  onJoin?: () => void;
}) {
  return (
    <article
      className={clsx(
        "overflow-hidden rounded-2xl border bg-app-elevated",
        game.isBookable ? "border-accent/40" : "border-white/10",
      )}
    >
      <img
        src={gameImage(game)}
        alt=""
        className="aspect-[16/7] w-full object-cover"
      />
      <div className="p-4">
        <span className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">
          {game.gameType}
        </span>
        <h3 className="mt-2 text-lg font-semibold leading-tight">{game.title}</h3>
        {game.description && (
          <p className="mt-1.5 line-clamp-3 text-sm text-fg-2">
            {game.description}
          </p>
        )}

        <div className="mt-3 space-y-1.5 text-sm text-white/85">
          <p className="flex items-center gap-2">
            <CalendarDays className="size-4 text-accent" />
            {formatGameDate(game)}
          </p>
          <p className="flex items-center gap-2">
            <Clock3 className="size-4 text-accent" />
            {formatGameTime(game)}
          </p>
          <p className="flex items-center gap-2">
            <UsersRound className="size-4 text-accent" />
            <span className={game.isBookable ? "text-green-300" : "text-fg-3"}>
              {availabilityLabel(game)}
            </span>
          </p>
        </div>

        {onJoin && (
          <button
            type="button"
            disabled={!game.isBookable}
            onClick={onJoin}
            className="mt-4 w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground transition-transform active:scale-95 disabled:bg-white/10 disabled:text-white/40"
          >
            {game.isBookable ? "Записаться" : availabilityLabel(game)}
          </button>
        )}
      </div>
    </article>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-200">
      {message}
    </div>
  );
}

function TrialForm({
  onBack,
  onDone,
}: {
  onBack: () => void;
  onDone: () => void;
}) {
  const options = useBookingOptions();
  const queryClient = useQueryClient();
  const [playersCount, setPlayersCount] = useState(1);
  const [preferredTimes, setPreferredTimes] = useState<string[]>([]);
  const [experienceLevel, setExperienceLevel] = useState<string>("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      createTrialRequest({
        playersCount,
        preferredTimes,
        experienceLevel: experienceLevel || null,
        isPrivate,
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-dnd"] });
      onDone();
    },
  });

  return (
    <div>
      <BackLink onClick={onBack} />
      <h2 className="text-2xl font-semibold">Хочу попробовать D&D</h2>

      <div className="mt-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-white/85">
        Это заявка, а не запись на конкретную дату. Клуб свяжется с вами,
        соберёт участников и предложит подходящую игру.
      </div>

      <div className="mt-6 space-y-6">
        <Field label="Сколько вас будет" hint="Можно оставить заявку за себя и друзей">
          <NumberChips
            max={options.dndMaxPlayersPerRequest}
            value={playersCount}
            onChange={setPlayersCount}
          />
        </Field>

        <Field label="Когда удобно" hint="Это пожелание, а не бронь. Можно выбрать несколько">
          <MultiChoiceChips
            options={options.dndTimePreferences}
            values={preferredTimes}
            onChange={setPreferredTimes}
          />
        </Field>

        <Field label="Опыт (необязательно)">
          <ChoiceChips
            columns={2}
            options={options.experienceLevels}
            value={experienceLevel}
            onChange={(value) =>
              setExperienceLevel((current) => (current === value ? "" : value))
            }
          />
        </Field>

        <label className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/3 px-3 py-3 text-sm text-white/85">
          <span>
            Хотим отдельную игру для своей компании
            <span className="mt-0.5 block text-xs text-fg-3">
              Без чужих игроков — например, день с друзьями
            </span>
          </span>
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(event) => setIsPrivate(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-accent"
          />
        </label>

        <Field label="Комментарий (необязательно)">
          <textarea
            value={notes}
            maxLength={500}
            rows={3}
            placeholder="Например: удобно только по выходным"
            onChange={(event) => setNotes(event.target.value)}
            className={clsx(inputClassName, "resize-none")}
          />
        </Field>

        {mutation.isError && <ErrorBox message={mutation.error.message} />}

        <button
          type="button"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
          className="w-full rounded-xl bg-accent px-4 py-4 text-base font-semibold text-accent-foreground transition-transform active:scale-95 disabled:opacity-50"
        >
          {mutation.isPending ? "Отправляем…" : "Отправить заявку"}
        </button>
      </div>
    </div>
  );
}

function JoinForm({
  game,
  onBack,
  onDone,
}: {
  game: DndGame;
  onBack: () => void;
  onDone: () => void;
}) {
  const options = useBookingOptions();
  const queryClient = useQueryClient();
  const maxQuantity = Math.max(
    1,
    Math.min(game.available, options.dndMaxPlayersPerRequest),
  );
  const [quantity, setQuantity] = useState(1);
  const [timeIsConvenient, setTimeIsConvenient] = useState<boolean | null>(null);
  const [experienceLevel, setExperienceLevel] = useState("");
  const [showErrors, setShowErrors] = useState(false);

  // у игры без точного времени вопроса «удобно ли время» нет — время согласует Мастер
  const exact = !!game.startsAt;
  const validationError =
    exact && timeIsConvenient === null
      ? "Ответьте, удобно ли время"
      : !experienceLevel
        ? "Выберите уровень опыта"
        : null;

  const mutation = useMutation({
    mutationFn: () =>
      bookDndGame(game.id, {
        quantity,
        timeIsConvenient: exact ? timeIsConvenient === true : true,
        experienceLevel,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dnd-games"] });
      queryClient.invalidateQueries({ queryKey: ["my-dnd"] });
      onDone();
    },
  });

  return (
    <div>
      <BackLink onClick={onBack} />
      <DndGameCard game={game} />

      <div className="mt-6 space-y-6">
        <Field label="Сколько мест" hint="Можно записать себя и друзей">
          <NumberChips max={maxQuantity} value={quantity} onChange={setQuantity} />
        </Field>

        {exact && (
          <Field label="Это время вам удобно?">
            <YesNoChips value={timeIsConvenient} onChange={setTimeIsConvenient} />
          </Field>
        )}

        <Field label="Опыт">
          <ChoiceChips
            columns={2}
            options={options.experienceLevels}
            value={experienceLevel}
            onChange={setExperienceLevel}
          />
        </Field>

        {showErrors && validationError && <ErrorBox message={validationError} />}
        {mutation.isError && <ErrorBox message={mutation.error.message} />}

        <button
          type="button"
          disabled={mutation.isPending}
          onClick={() => {
            setShowErrors(true);
            if (!validationError) mutation.mutate();
          }}
          className="w-full rounded-xl bg-accent px-4 py-4 text-base font-semibold text-accent-foreground transition-transform active:scale-95 disabled:opacity-50"
        >
          {mutation.isPending ? "Записываем…" : "Подтвердить запись"}
        </button>
      </div>
    </div>
  );
}

function DndDone({ kind, game }: { kind: "trial" | "join"; game?: DndGame }) {
  const navigate = useNavigate();
  const { resetStages } = useRegistrationStageStore();
  const { resetReservation } = useReservationStore();

  const finish = (path: string) => {
    resetStages();
    resetReservation();
    navigate(path);
  };

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center py-8 text-center">
      <div className="mb-5 flex size-24 items-center justify-center rounded-full border border-green-400/70 bg-green-400/15 text-green-400 shadow-[0_0_36px_currentColor]">
        <CheckCircle2 className="size-14" />
      </div>
      <h2 className="text-2xl font-semibold">
        {kind === "trial" ? "Заявка отправлена!" : "Ты записан!"}
      </h2>
      <p className="mt-2 text-base text-fg-2">
        {kind === "trial"
          ? "Мы подберём группу и напишем вам в Telegram."
          : game
            ? `«${game.title}», ${formatGameDate(game)}${game.startsAt ? `, ${formatGameTime(game)}` : ""}`
            : "Ждём тебя на игре."}
      </p>
      {kind === "join" && (
        <p className="mt-3 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm font-semibold text-white">
          {DND_MASTER_CONTACT}
        </p>
      )}

      <button
        type="button"
        onClick={() => finish("/reservations")}
        className="mt-6 w-full rounded-xl bg-accent px-4 py-4 text-base font-semibold text-accent-foreground transition-transform active:scale-95"
      >
        Мои записи
      </button>
      <button
        type="button"
        onClick={() => finish("/")}
        className="mt-3 w-full rounded-xl border border-white/15 bg-white/3 px-4 py-4 text-base font-semibold text-white transition-colors active:bg-white/10"
      >
        На главную
      </button>
    </div>
  );
}
