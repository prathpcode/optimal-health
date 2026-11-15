import { describe, expect, it } from "vitest";
import { challengeDays, challengeTemplate, dayKey, defaultShares, minToPlace, scoreEntry, settle, type SettleEntry } from "./challenge";

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

describe("scoreEntry", () => {
  const window = { startsAt: START, days: 3, tzOffsetMinutes: 0 };
  it("counts days with a scan, once a day", () => {
    const t = challengeTemplate("scan_before_order")!;
    const s = scoreEntry(t, window, [START, START + H, START + 2 * D], []);
    expect(s.total).toBe(2);
    expect(s.perDay).toEqual({ "2026-11-02": 1, "2026-11-03": 0, "2026-11-04": 1 });
  });
  it("caps scans per day and ignores scans outside the challenge", () => {
    const t = challengeTemplate("scan_every_meal_out")!;
    const scans = [0, 1, 2, 3, 4].map((i) => START + i * H).concat([START - D, START + 3 * D]);
    expect(scoreEntry(t, window, scans, []).total).toBe(3);
  });
  it("counts only yes check-ins on challenge days", () => {
    const t = challengeTemplate("no_added_sugar")!;
    const s = scoreEntry(t, window, [START], [
      { day: "2026-11-02", value: "yes" },
      { day: "2026-11-03", value: "no" },
      { day: "2026-11-09", value: "yes" },
    ]);
    expect(s.total).toBe(1);
  });
  it("needs 70% of the days to place, rounded up", () => {
    expect(minToPlace(challengeTemplate("no_added_sugar")!, 7)).toBe(5);
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
