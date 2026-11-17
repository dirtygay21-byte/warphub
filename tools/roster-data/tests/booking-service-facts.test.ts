// Корешок билета услуги (запись, 17.11.2026): часы и люди берутся из настроек услуги.
import { describe, expect, test } from "bun:test";
import { serviceFacts, shortHours } from "../../../client/src/components/booking/serviceFacts";

describe("booking service facts", () => {
  test("hours", () => {
    expect(shortHours(180)).toBe("3 ч");
    expect(shortHours(90)).toBe("1,5 ч");
    expect(shortHours(45)).toBe("45 мин");
  });
  test("table game for two", () => {
    expect(serviceFacts({ duration: 180, seatsPerTable: 2 })).toEqual({
      hours: { value: "3 ч", note: "игра" },
      people: { value: "2", note: "игрока" },
    });
  });
  test("training with trainer", () => {
    expect(serviceFacts({ duration: 120, seatsPerTable: 1, hasTrainer: true })).toEqual({
      hours: { value: "2 ч", note: "занятие" },
      people: { value: "1+1", note: "с тренером" },
    });
  });
  test("pool capacity, no data", () => {
    expect(serviceFacts({ duration: null, visitorsCapacity: 6 })).toEqual({ hours: null, people: { value: "до 6", note: "человек" } });
    expect(serviceFacts({})).toEqual({ hours: null, people: null });
  });
});
