import { create } from "zustand";
import type { AvailabilitySegment, SessionPlayer } from "@/apiUtils/booking";
import type { Table } from "@/types";
import { getToday } from "@/utils/date";

/**
 * Выбранный слот:
 *  - new  — свободный стол, игрок начинает новую игру и выбирает время;
 *  - join — присоединение к игре 1/2, время фиксировано;
 *  - pool — общая вместимость (покраска, посещение клуба).
 */
export type SelectedSlot =
  | {
      kind: "new";
      tableId: number;
      /** категория стола: задаёт список игр в анкете */
      category?: "wh" | "small";
      label: string;
      window: { startsAt: string; endsAt: string };
      segments: AvailabilitySegment[];
      capacity: number;
      /** B1: минимум для укороченной записи, минут */
      minMinutes?: number;
    }
  | {
      kind: "join";
      tableId: number;
      category?: "wh" | "small";
      startsAt: string;
      endsAt: string;
      occupied: number;
      capacity: number;
      players: SessionPlayer[];
    }
  | {
      kind: "pool";
      window: { startsAt: string; endsAt: string };
      segments: AvailabilitySegment[];
      capacity: number;
      freeSeats: number;
      /** B1: минимум для укороченной записи, минут */
      minMinutes?: number;
    };

export type LastBooking = {
  startsAt: string | null;
  endsAt: string | null;
  joined: boolean;
  partySize: number;
};

export type DndInitialView = "home" | "trial";

type ReservationStore = {
  disciplineId: number | null;
  serviceId: number | null;
  tableId: number | null;
  selectedDate: Date;
  selectedTable: Table | null;
  selectedSlot: SelectedSlot | null;
  partyCount: number;
  seatClubArmyOptions: boolean[];
  buyArmyOptions: boolean[];
  lastBooking: LastBooking | null;
  dndInitialView: DndInitialView;

  setDisciplineId: (id: number | null) => void;
  setServiceId: (id: number | null) => void;
  setTableId: (id: number | null) => void;
  setSelectedDate: (date: Date) => void;
  setSelectedTable: (table: Table | null) => void;
  setSelectedSlot: (slot: SelectedSlot | null) => void;
  setPartyCount: (count: number) => void;
  setSeatClubArmyOptions: (options: boolean[]) => void;
  setBuyArmyOptions: (options: boolean[]) => void;
  setLastBooking: (booking: LastBooking | null) => void;
  setDndInitialView: (view: DndInitialView) => void;
  resetReservation: () => void;
};

export const useReservationStore = create<ReservationStore>((set) => ({
  disciplineId: null,
  serviceId: null,
  tableId: null,
  selectedDate: getToday(),
  selectedTable: null,
  selectedSlot: null,
  partyCount: 1,
  seatClubArmyOptions: [],
  buyArmyOptions: [],
  lastBooking: null,
  dndInitialView: "home",
  setDisciplineId: (id: number | null) =>
    set({
      disciplineId: id,
      serviceId: null,
      tableId: null,
      selectedTable: null,
      selectedSlot: null,
    }),
  setServiceId: (id: number | null) =>
    set({ serviceId: id, tableId: null, selectedTable: null, selectedSlot: null }),
  setTableId: (id: number | null) => set({ tableId: id }),
  setSelectedDate: (date: Date) =>
    set({ selectedDate: date, tableId: null, selectedTable: null, selectedSlot: null }),
  setSelectedTable: (table: Table | null) =>
    set({ selectedTable: table, tableId: table?.id ?? null }),
  setSelectedSlot: (slot: SelectedSlot | null) =>
    set({
      selectedSlot: slot,
      tableId: slot && slot.kind !== "pool" ? slot.tableId : null,
    }),
  setPartyCount: (count: number) => set({ partyCount: count }),
  setSeatClubArmyOptions: (options: boolean[]) =>
    set({ seatClubArmyOptions: options }),
  setBuyArmyOptions: (options: boolean[]) => set({ buyArmyOptions: options }),
  setLastBooking: (booking: LastBooking | null) => set({ lastBooking: booking }),
  setDndInitialView: (view: DndInitialView) => set({ dndInitialView: view }),
  resetReservation: () =>
    set({
      disciplineId: null,
      serviceId: null,
      tableId: null,
      selectedDate: getToday(),
      selectedTable: null,
      selectedSlot: null,
      partyCount: 1,
      seatClubArmyOptions: [],
      buyArmyOptions: [],
      lastBooking: null,
      dndInitialView: "home",
    }),
}));
