import { describe, expect, it } from "vitest";
import { challengeDays, dayKey, defaultShares, maxPoints, rankPlayers, scoreMeals, settle, type Meal, type SettleEntry } from "./challenge";

const START = Date.UTC(2026, 10, 2, 8); // 2 Nov 2026, 08:00 UTC
const H = 3_600_000;
const D = 24 * H;

describe("days", () => {
  it("uses the creator's time zone", () => {
    const lateEvening = Date.UTC(2026, 10, 3, 3); // 3 Nov 03:00 UTC = 2 Nov 19:00 in UTC-8
    expect(dayKey(lateEvening, -480)).toBe("2026-11-02");
    expect(dayKey(lateEvening, 0)).toBe("2026-11-03");
  });
  it("lists every challenge day", () => {
    expect(challengeDays(START, 3, 0)).toEqual(["2026-11-02", "2026-11-03", "2026-11-04"]);
  });
});

describe("scoreMeals", () => {
  const window = { startsAt: START, days: 7, tzOffsetMinutes: 0 };
  const meal = (h: number, fit: Meal["fit"], dish = "Dish") => ({ at: START + h * H, fit, dish });

  it("adds up points: good 3, okay 1, not a fit 0", () => {
    const s = scoreMeals([meal(1, "good"), meal(5, "okay"), meal(30, "not_fit"), meal(50, "good")], window);
    expect(s).toMatchObject({ points: 7, meals: 4, good: 2, okay: 1, notFit: 1 });
    expect(s.perDay).toMatchObject({ "2026-11-02": 4, "2026-11-03": 0, "2026-11-04": 3 });
  });
  it("lists each dish with what it scored, oldest first", () => {
    const s = scoreMeals([meal(5, "okay", "Tikka"), meal(1, "good", "Salmon bowl")], window);
    expect(s.plays.map((p) => [p.dish, p.points])).toEqual([["Salmon bowl", 3], ["Tikka", 1]]);
  });
  it("counts at most three dishes a day; a can't-tell dish scores nothing and takes no slot", () => {
    const s = scoreMeals([meal(1, "cant_tell"), meal(2, "good"), meal(3, "good"), meal(4, "okay"), meal(5, "good")], window);
    expect(s.points).toBe(7);
    expect(s.meals).toBe(3);
    expect(s.plays.map((p) => p.skipped)).toEqual(["cant_tell", undefined, undefined, undefined, "daily_limit"]);
  });
  it("leaves out dishes outside the race", () => {
    const s = scoreMeals([meal(-10, "good"), meal(1, "good"), meal(24 * 8, "good")], window);
    expect(s.points).toBe(3);
    expect(s.plays).toHaveLength(1);
  });
  it("starts at zero", () => {
    expect(scoreMeals([], window)).toMatchObject({ points: 0, meals: 0, plays: [] });
  });
  it("knows the most a player can score", () => {
    expect(maxPoints(7)).toBe(63);
  });
});

describe("rankPlayers", () => {
  const p = (id: string, points: number, good: number, joinedAt = 0) => ({ id, points, good, joinedAt });
  it("ranks by points, then by more Good fits", () => {
    expect(rankPlayers([p("a", 6, 1), p("b", 9, 3), p("c", 6, 2), p("d", 0, 0)])).toEqual({ b: 1, c: 2, a: 3, d: 4 });
  });
  it("lets players level on both share a rank", () => {
    expect(rankPlayers([p("a", 9, 3, 1), p("b", 9, 3, 2), p("c", 4, 1)])).toEqual({ a: 1, b: 1, c: 3 });
  });
});

describe("defaultShares", () => {
  it("pays more places as the group grows", () => {
    expect(defaultShares(3)).toEqual([100]);
    expect(defaultShares(6)).toEqual([70, 30]);
    expect(defaultShares(12)).toEqual([60, 30, 10]);
  });
});

const entry = (id: string, score: number, joinedAt = 0, netCents = 1000): SettleEntry => ({ id, score, joinedAt, netCents });
const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

describe("settle", () => {
  it("gives the whole prize to the winner, after the fee", () => {
    const s = settle({ entries: [entry("a", 7), entry("b", 5), entry("c", 2)], shares: [100], feeBps: 1000, minToPlace: 5 });
    expect(s).toMatchObject({ refundAll: false, potCents: 3000, feeCents: 300, prizeCents: 2700 });
    expect(s.payouts).toEqual({ a: 2700, b: 0, c: 0 });
    expect(s.ranks).toEqual({ a: 1, b: 2, c: 3 });
  });
  it("splits places by share and never loses a cent", () => {
    const entries = [entry("a", 9), entry("b", 8), entry("c", 7), entry("d", 1), entry("e", 1)];
    const s = settle({ entries: entries.map((e) => ({ ...e, netCents: 967 })), shares: [70, 30], feeBps: 0, minToPlace: 5 });
    expect(s.payouts.a).toBe(3385);
    expect(s.payouts.b).toBe(1450);
    expect(sum(s.payouts)).toBe(s.prizeCents);
  });
  it("pools tied places and splits them equally, extra cents to who joined first", () => {
    const s = settle({ entries: [entry("a", 7, 2), entry("b", 7, 1), entry("c", 7, 3)], shares: [100], feeBps: 0, minToPlace: 1 });
    expect(s.payouts).toEqual({ b: 1000, a: 1000, c: 1000 });
    expect(s.ranks).toEqual({ a: 1, b: 1, c: 1 });
    const t = settle({ entries: [entry("a", 7, 2, 500), entry("b", 7, 1, 500), entry("c", 1, 3, 1)], shares: [100], feeBps: 0, minToPlace: 5 });
    expect(t.payouts).toEqual({ b: 501, a: 500, c: 0 });
  });
  it("shares a tie that straddles the last paid place", () => {
    const entries = [entry("a", 9), entry("b", 8, 1), entry("c", 8, 2), entry("d", 1), entry("e", 1)];
    const s = settle({ entries, shares: [70, 30], feeBps: 0, minToPlace: 5 });
    expect(s.payouts).toMatchObject({ a: 3500, b: 750, c: 750, d: 0 });
  });
  it("rolls unclaimed places to placed players", () => {
    const entries = [entry("a", 9), ...["b", "c", "d", "e"].map((id) => entry(id, 1))];
    const s = settle({ entries, shares: [70, 30], feeBps: 0, minToPlace: 5 });
    expect(s.payouts.a).toBe(5000);
  });
  it("refunds everyone's own entry when nobody reaches the minimum, with no fee", () => {
    const s = settle({ entries: [entry("a", 1, 0, 950), entry("b", 0, 0, 940)], shares: [100], feeBps: 1000, minToPlace: 5 });
    expect(s).toMatchObject({ refundAll: true, feeCents: 0 });
    expect(s.payouts).toEqual({ a: 950, b: 940 });
  });
  it("pays from what actually came in", () => {
    const s = settle({ entries: [entry("a", 5, 0, 941), entry("b", 0, 0, 941)], shares: [100], feeBps: 0, minToPlace: 5 });
    expect(s.payouts.a).toBe(1882);
  });
  it("pays nothing in a free challenge", () => {
    const s = settle({ entries: [entry("a", 5, 0, 0), entry("b", 0, 0, 0)], shares: [100], feeBps: 0, minToPlace: 5 });
    expect(sum(s.payouts)).toBe(0);
  });
});
