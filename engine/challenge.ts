import type { Fit } from "./types";

/**
 * The points race: a challenge between friends.
 * After a scan, a player taps the dish they ordered. Each dish earns points by how well it fits that player's own
 * needs (the same verdict the app shows them): Good fit 3, Okay with notes 1, Not a fit 0. Every dish logged in the
 * race counts, and a player's score is the average: their points over the number of dishes. So how well the dishes
 * fit decides the race, not how many are logged. Best average when the race ends wins. A race can be free, or every
 * player pays the same entry and the winner takes the pool (settlePot).
 * Pure: amounts are integer cents, every rounding rule is written here.
 */

export const CHALLENGE_NAME = "Points race";

export const DURATION_OPTIONS_DAYS = [3, 7, 14] as const;

/** Points per dish. "Can't tell" dishes score nothing and do not use up one of the day's meals. */
export const MEAL_POINTS: Record<Fit, number> = { good: 3, okay: 1, not_fit: 0, cant_tell: 0 };

/** The score that wins a race: points per dish that counted, from 0 to 3. No dishes yet is 0. */
export function averageScore(points: number, meals: number): number {
  return meals > 0 ? points / meals : 0;
}

const DAY_MS = 86_400_000;

/**
 * The challenge's day for a moment, as YYYY-MM-DD in the creator's time zone. `tzOffsetMinutes` is minutes east of
 * UTC (the negative of JavaScript's getTimezoneOffset()).
 */
export function dayKey(ms: number, tzOffsetMinutes: number): string {
  return new Date(ms + tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

/** Every day a challenge runs, first to last. */
export function challengeDays(startsAt: number, days: number, tzOffsetMinutes: number): string[] {
  return Array.from({ length: days }, (_, i) => dayKey(startsAt + i * DAY_MS, tzOffsetMinutes));
}

export type Meal = { at: number; fit: Fit; dish?: string };

/** One logged dish inside the race and what it scored. */
export type Play = {
  at: number;
  /** Challenge day, YYYY-MM-DD. */
  day: string;
  dish: string;
  fit: Fit;
  points: number;
  /** Why it did not count: a verdict we couldn't give. */
  skipped?: "cant_tell";
};

export type MealScore = {
  /** Total points of the dishes that counted. The score shown and ranked on is averageScore(points, meals). */
  points: number;
  /** Dishes that counted (inside the race, "can't tell" left out). */
  meals: number;
  good: number;
  okay: number;
  notFit: number;
  /** Points per challenge day. */
  perDay: Record<string, number>;
  /** Every dish logged inside the race, oldest first, including ones that did not count. */
  plays: Play[];
};

export function scoreMeals(meals: Meal[], window: { startsAt: number; days: number; tzOffsetMinutes: number }): MealScore {
  const days = challengeDays(window.startsAt, window.days, window.tzOffsetMinutes);
  const perDay: Record<string, number> = Object.fromEntries(days.map((d) => [d, 0]));
  const plays: Play[] = [];
  for (const m of [...meals].sort((a, b) => a.at - b.at)) {
    const day = dayKey(m.at, window.tzOffsetMinutes);
    if (!(day in perDay)) continue;
    const base = { at: m.at, day, dish: m.dish ?? "A dish", fit: m.fit };
    if (m.fit === "cant_tell") {
      plays.push({ ...base, points: 0, skipped: "cant_tell" });
    } else {
      perDay[day] += MEAL_POINTS[m.fit];
      plays.push({ ...base, points: MEAL_POINTS[m.fit] });
    }
  }
  const counted = plays.filter((p) => !p.skipped);
  return {
    points: counted.reduce((a, p) => a + p.points, 0),
    meals: counted.length,
    good: counted.filter((p) => p.fit === "good").length,
    okay: counted.filter((p) => p.fit === "okay").length,
    notFit: counted.filter((p) => p.fit === "not_fit").length,
    perDay,
    plays,
  };
}

export type RankInput = { id: string; points: number; meals: number; joinedAt: number };

/**
 * Leaderboard order: best average (points per dish), then more dishes. Averages are compared by cross-multiplying,
 * so no rounding decides a place; a player with no dishes has an average of 0. Players level on both share a rank
 * (1, 1, 3); within a shared rank whoever joined first is listed first.
 */
export function rankPlayers(players: RankInput[]): Record<string, number> {
  // a's average minus b's, as a whole number with the same sign: pa/ma - pb/mb, times ma*mb.
  const byAverage = (a: RankInput, b: RankInput) => a.points * Math.max(b.meals, 1) - b.points * Math.max(a.meals, 1);
  const sorted = [...players].sort((a, b) => byAverage(b, a) || b.meals - a.meals || a.joinedAt - b.joinedAt);
  const ranks: Record<string, number> = {};
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1];
    const same = prev && byAverage(prev, p) === 0 && prev.meals === p.meals;
    ranks[p.id] = same ? ranks[prev.id] : i + 1;
  });
  return ranks;
}

// ── Money races ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Entry prices the slider stops at when starting a race, in cents: fine steps at the low end, coarse at the top. */
export const ENTRY_OPTIONS_CENTS = [100, 200, 300, 500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10_000] as const;
/** What the backend accepts for an entry: whole dollars, $1 to $100. */
export const ENTRY_MIN_CENTS = 100;
export const ENTRY_MAX_CENTS = 10_000;

export function validEntryCents(cents: number): boolean {
  return Number.isInteger(cents) && cents >= ENTRY_MIN_CENTS && cents <= ENTRY_MAX_CENTS && cents % 100 === 0;
}

/**
 * A payment provider's amount in major units ("10.00", "9.4", 10) as integer cents, without going through a float
 * for the fraction. Anything that is not a plain non-negative amount is null.
 */
export function centsFromAmount(amount: unknown): number | null {
  const text = typeof amount === "number" ? String(amount) : typeof amount === "string" ? amount.trim() : "";
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

export type PotEntry = { id: string; netCents: number; points: number; meals: number; joinedAt: number };

export type Settlement = {
  /** True when there is no winner to pay: every player gets their own entry back instead. */
  refundAll: boolean;
  potCents: number;
  feeCents: number;
  prizeCents: number;
  /** Final places, as on the leaderboard (rankPlayers). */
  ranks: Record<string, number>;
  /** Prize cents per player; 0 for everyone when `refundAll`. */
  payouts: Record<string, number>;
};

/** Split `total` cents into `n` equal parts; leftover cents go to the earliest parts, so they always add up. */
function splitEqually(total: number, n: number): number[] {
  const each = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => each + (i < total - each * n ? 1 : 0));
}

/**
 * Who gets what when a money race ends: the winner takes the pool.
 * - The pool is what the payment provider actually paid us for each entry (net of its fee), so the prize can never
 *   exceed what came in. `feeBps` is our own cut of the pool, in hundredths of a percent.
 * - The winner is first place on the leaderboard (rankPlayers) and must have logged at least one dish that counted.
 * - Players level for first split the prize equally; leftover cents go to whoever joined first.
 * - With fewer than two paid players, or when nobody logged a dish, there is no race: everyone is refunded and no
 *   fee is taken.
 */
export function settlePot(input: { entries: PotEntry[]; feeBps: number }): Settlement {
  const { entries } = input;
  const potCents = entries.reduce((a, e) => a + e.netCents, 0);
  const ranks = rankPlayers(entries);
  const payouts: Record<string, number> = Object.fromEntries(entries.map((e) => [e.id, 0]));
  const winners = entries.filter((e) => ranks[e.id] === 1 && e.meals > 0).sort((a, b) => a.joinedAt - b.joinedAt);

  if (entries.length < 2 || !winners.length) return { refundAll: true, potCents, feeCents: 0, prizeCents: 0, ranks, payouts };

  const bps = Math.min(10_000, Math.max(0, Math.floor(input.feeBps) || 0));
  const feeCents = Math.floor((potCents * bps) / 10_000);
  const prizeCents = potCents - feeCents;
  splitEqually(prizeCents, winners.length).forEach((c, i) => (payouts[winners[i].id] = c));
  return { refundAll: false, potCents, feeCents, prizeCents, ranks, payouts };
}
