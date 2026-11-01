/**
 * Шаги подготовки к битве (G2.1) — в порядке правил колоды миссий Chapter Approved 2026-27:
 * игроки → типы армий (тайно, затем раскрытие) → раскладка → атакующий и защитник (бросок, победитель выбирает) →
 * вторичные миссии (тайно, затем раскрытие) → первый ход (бросок, победитель ходит первым) → начало битвы.
 * Экран подготовки и движок берут список шагов отсюда, поэтому «чего не хватает» везде одинаково.
 * Dominatus (DM1): + «Кампания» (фаза, локация, альянсы) после игроков и «Agenda и улучшения» после типов армий.
 */
import { SEATS, type GameState } from './types';

export type SetupStepId = 'players' | 'campaign' | 'dispositions' | 'agendas' | 'layout' | 'roles' | 'secondaries' | 'first-turn';

export interface SetupStep {
  id: SetupStepId;
  title: string;
  done: boolean;
  /** чего не хватает для этого шага (пусто, если сделан) */
  missing: string[];
}

export function setupSteps(s: GameState): SetupStep[] {
  const name = (seat: 'p1' | 'p2') => s.players[seat].name;
  const disp = SEATS.filter((seat) => !s.players[seat].disposition).map((seat) => `${name(seat)}: тип армии`);
  const sec = SEATS.filter((seat) => !s.players[seat].secondaryMode).map((seat) => `${name(seat)}: режим вторичных миссий`);
  const step = (id: SetupStepId, title: string, missing: string[]): SetupStep => ({ id, title, done: missing.length === 0, missing });
  const d = s.dominatus;
  // Dominatus (DM1): фаза и локация, альянсы — до типов армий; Agenda (по Briefing) и улучшения — после раскрытия
  const campaign = d
    ? [
        ...(d.locationId ? [] : ['фаза кампании и локация']),
        ...SEATS.filter((seat) => !d.players[seat].alliance).map((seat) => `${name(seat)}: альянс`),
        ...(d.players.p1.alliance && d.players.p1.alliance === d.players.p2.alliance ? ['игроки должны быть из разных альянсов'] : []),
      ]
    : [];
  const agendas = d
    ? [
        ...SEATS.filter((seat) => d.players[seat].attempt === null).map((seat) => `${name(seat)}: играть ли Agenda`),
        ...(d.players.p1.attempt && d.players.p2.attempt ? SEATS.filter((seat) => !d.players[seat].agenda).map((seat) => `${name(seat)}: Agenda`) : []),
      ]
    : [];
  return [
    // G2.12: у каждого игрока должен быть ростер (свой или по коду)
    step('players', 'Игроки и ростеры', SEATS.filter((seat) => s.players[seat].roster.source === 'none').map((seat) => `${name(seat)}: ростер`)),
    ...(d ? [step('campaign', 'Кампания: фаза, локация, альянсы', campaign)] : []),
    step('dispositions', 'Типы армий', s.dispositionsRevealed ? [] : disp.length ? disp : ['раскрытие типов армий']),
    ...(d ? [step('agendas', 'Agenda и улучшения', s.dispositionsRevealed ? agendas : ['раскрытие типов армий'])] : []),
    step('layout', 'Раскладка', s.layoutId ? [] : ['раскладка']),
    step('roles', 'Атакующий и защитник', s.players.p1.role ? [] : ['атакующий и защитник']),
    step('secondaries', 'Вторичные миссии', s.secondariesRevealed ? [] : sec.length ? sec : ['раскрытие режимов вторичных']),
    step('first-turn', 'Первый ход', s.firstTurn ? [] : ['кто ходит первым']),
  ];
}

/** Первый несделанный шаг (null — всё готово, можно начинать битву). */
export function currentSetupStep(s: GameState): SetupStepId | null {
  return setupSteps(s).find((x) => !x.done)?.id ?? null;
}

/** Чего не хватает для начала битвы (пусто — можно начинать). */
export function setupMissing(s: GameState): string[] {
  return setupSteps(s).flatMap((x) => x.missing);
}
