import { describe, expect, it } from "vitest";
import { averageScore, centsFromAmount, challengeDays, dayKey, rankPlayers, scoreMeals, settlePot, validEntryCents, type Meal, type PotEntry } from "./challenge";

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
  it("counts every dish, however many a day; a can't-tell dish is left out of the average", () => {
    const many = Array.from({ length: 12 }, (_, i) => meal(2 + i, i < 6 ? "good" : "okay"));
    const s = scoreMeals([meal(1, "cant_tell"), ...many], window);
    expect(s.points).toBe(24);
    expect(s.meals).toBe(12);
    expect(s.plays.map((p) => p.skipped)).toEqual(["cant_tell", ...many.map(() => undefined)]);
    expect(averageScore(s.points, s.meals)).toBe(2);
  });
  it("scores the average per dish, and 0 before any dish", () => {
    expect(averageScore(7, 4)).toBe(1.75);
    expect(averageScore(6, 2)).toBe(3);
    expect(averageScore(0, 0)).toBe(0);
  });
  it("leaves out dishes outside the race", () => {
    const s = scoreMeals([meal(-10, "good"), meal(1, "good"), meal(24 * 8, "good")], window);
    expect(s.points).toBe(3);
    expect(s.plays).toHaveLength(1);
  });
  it("starts at zero", () => {
    expect(scoreMeals([], window)).toMatchObject({ points: 0, meals: 0, plays: [] });
  });
});

describe("rankPlayers", () => {
  const p = (id: string, points: number, meals: number, joinedAt = 0) => ({ id, points, meals, joinedAt });
  it("ranks by average, not total, then by more dishes", () => {
    // a 2.0 over 3, b 1.5 over 10, c 2.0 over 6, d nothing logged
    expect(rankPlayers([p("a", 6, 3), p("b", 15, 10), p("c", 12, 6), p("d", 0, 0)])).toEqual({ c: 1, a: 2, b: 3, d: 4 });
  });
  it("lets players level on both share a rank", () => {
    expect(rankPlayers([p("a", 9, 3, 1), p("b", 9, 3, 2), p("c", 4, 4)])).toEqual({ a: 1, b: 1, c: 3 });
  });
});

describe("centsFromAmount", () => {
  it("reads major units as whole cents", () => {
    expect(centsFromAmount("10.00")).toBe(1000);
    expect(centsFromAmount("9.4")).toBe(940);
    expect(centsFromAmount(10)).toBe(1000);
    expect(centsFromAmount("0.29")).toBe(29);
    expect(centsFromAmount(19.99)).toBe(1999);
  });
  it("refuses anything that is not a plain amount", () => {
    for (const bad of ["", "-5", "1.234", "ten", null, undefined, {}, NaN]) expect(centsFromAmount(bad)).toBeNull();
  });
});

describe("validEntryCents", () => {
  it("allows whole dollars from $1 to $100", () => {
    expect([100, 500, 10_000].every(validEntryCents)).toBe(true);
    expect([0, 50, 550, 10_100, -500, 5.5].some(validEntryCents)).toBe(false);
  });
});

const entry = (id: string, points: number, meals: number, joinedAt = 0, netCents = 1000): PotEntry => ({ id, points, meals, joinedAt, netCents });
const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

describe("settlePot", () => {
  it("gives the whole pool to the best average, after our fee", () => {
    // a 2.0 over 3 dishes, b 1.5 over 10, c nothing logged
    const s = settlePot({ entries: [entry("a", 6, 3), entry("b", 15, 10), entry("c", 0, 0)], feeBps: 1000 });
    expect(s).toMatchObject({ refundAll: false, potCents: 3000, feeCents: 300, prizeCents: 2700 });
    expect(s.payouts).toEqual({ a: 2700, b: 0, c: 0 });
    expect(s.ranks).toEqual({ a: 1, b: 2, c: 3 });
  });
  it("pays from what actually came in, not the list price", () => {
    const s = settlePot({ entries: [entry("a", 3, 1, 0, 941), entry("b", 0, 1, 0, 941)], feeBps: 0 });
    expect(s.payouts).toEqual({ a: 1882, b: 0 });
  });
  it("splits a tie for first equally, extra cents to who joined first, and never loses a cent", () => {
    const s = settlePot({ entries: [entry("a", 9, 3, 2, 333), entry("b", 9, 3, 1, 333), entry("c", 1, 3, 3, 334)], feeBps: 0 });
    expect(s.payouts).toEqual({ b: 500, a: 500, c: 0 });
    const t = settlePot({ entries: [entry("a", 9, 3, 2, 500), entry("b", 9, 3, 1, 501), entry("c", 1, 3, 3, 0)], feeBps: 0 });
    expect(t.payouts).toEqual({ b: 501, a: 500, c: 0 });
    expect(sum(t.payouts)).toBe(t.prizeCents);
  });
  it("lets someone who logged only dishes worth 0 win over people who logged nothing", () => {
    const s = settlePot({ entries: [entry("a", 0, 2), entry("b", 0, 0)], feeBps: 0 });
    expect(s.payouts).toEqual({ a: 2000, b: 0 });
  });
  it("refunds everyone, with no fee, when nobody logged a dish", () => {
    const s = settlePot({ entries: [entry("a", 0, 0), entry("b", 0, 0)], feeBps: 1000 });
    expect(s).toMatchObject({ refundAll: true, feeCents: 0, prizeCents: 0 });
    expect(sum(s.payouts)).toBe(0);
  });
  it("refunds a race only one person paid into, even if they scored", () => {
    expect(settlePot({ entries: [entry("a", 9, 3)], feeBps: 0 })).toMatchObject({ refundAll: true });
    expect(settlePot({ entries: [], feeBps: 0 })).toMatchObject({ refundAll: true, potCents: 0 });
  });
  it("keeps the fee between nothing and the whole pool", () => {
    expect(settlePot({ entries: [entry("a", 3, 1), entry("b", 0, 1)], feeBps: -500 }).feeCents).toBe(0);
    expect(settlePot({ entries: [entry("a", 3, 1), entry("b", 0, 1)], feeBps: 99_999 }).prizeCents).toBe(0);
  });
});
