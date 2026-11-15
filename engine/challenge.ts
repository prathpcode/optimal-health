import type { Fit } from "./types";

/**
 * The points race: a challenge between friends.
 * After a scan, a player taps the dish they ordered. Each dish earns points by how well it fits that player's own
 * needs (the same verdict the app shows them): Good fit 3, Okay with notes 1, Not a fit 0. At most MEALS_PER_DAY
 * dishes count a day, so a day of snacks cannot swamp a week. Most points when the race ends wins.
 * Pure: amounts are integer cents, every rounding rule is written here.
 */

export const CHALLENGE_NAME = "Points race";

export const DURATION_OPTIONS_DAYS = [3, 7, 14] as const;

/** Points per dish. "Can't tell" dishes score nothing and do not use up one of the day's meals. */
export const MEAL_POINTS: Record<Fit, number> = { good: 3, okay: 1, not_fit: 0, cant_tell: 0 };

/** At most this many dishes count per day. */
export const MEALS_PER_DAY = 3;

/** The most points one player can score in a race. */
export function maxPoints(days: number): number {
  return days * MEALS_PER_DAY * MEAL_POINTS.good;
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
  /** Why it scored nothing although it might have: a fourth dish that day, or a verdict we couldn't give. */
  skipped?: "daily_limit" | "cant_tell";
};

export type MealScore = {
  /** Total points. */
  points: number;
  /** Dishes that counted (inside the race, at most MEALS_PER_DAY a day, "can't tell" left out). */
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
  const used: Record<string, number> = {};
  const plays: Play[] = [];
  for (const m of [...meals].sort((a, b) => a.at - b.at)) {
    const day = dayKey(m.at, window.tzOffsetMinutes);
    if (!(day in perDay)) continue;
    const base = { at: m.at, day, dish: m.dish ?? "A dish", fit: m.fit };
    if (m.fit === "cant_tell") {
      plays.push({ ...base, points: 0, skipped: "cant_tell" });
    } else if ((used[day] ?? 0) >= MEALS_PER_DAY) {
      plays.push({ ...base, points: 0, skipped: "daily_limit" });
    } else {
      used[day] = (used[day] ?? 0) + 1;
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

export type RankInput = { id: string; points: number; good: number; joinedAt: number };

/**
 * Leaderboard order: most points, then more Good fits. Players level on both share a rank (1, 1, 3); within a shared
 * rank whoever joined first is listed first.
 */
export function rankPlayers(players: RankInput[]): Record<string, number> {
  const sorted = [...players].sort((a, b) => b.points - a.points || b.good - a.good || a.joinedAt - b.joinedAt);
  const ranks: Record<string, number> = {};
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1];
    const same = prev && prev.points === p.points && prev.good === p.good;
    ranks[p.id] = same ? ranks[prev.id] : i + 1;
  });
  return ranks;
}

/** How the prize is split between places, in percent. */
export function defaultShares(players: number): number[] {
  if (players >= 10) return [60, 30, 10];
  if (players >= 5) return [70, 30];
  return [100];
}

export type SettleEntry = { id: string; netCents: number; score: number; joinedAt: number };

export type Settlement = {
  /** True when nobody reached the minimum: every player gets their own entry back instead of prizes. */
  refundAll: boolean;
  potCents: number;
  feeCents: number;
  prizeCents: number;
  /** Rank by score, 1 = best; players with the same score share a rank (1, 1, 3). */
  ranks: Record<string, number>;
  payouts: Record<string, number>;
};

/** Split `total` cents by weights; leftover cents go to the earliest weights, so the parts always add up to `total`. */
function splitCents(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) return weights.map(() => 0);
  const parts = weights.map((w) => Math.floor((total * w) / sum));
  let left = total - parts.reduce((a, b) => a + b, 0);
  for (let i = 0; left > 0; i = (i + 1) % parts.length, left--) parts[i] += 1;
  return parts;
}

/**
 * Who gets what when a challenge ends.
 * - The pot is what Whop actually paid us (net of its fee), so payouts can never exceed what came in.
 * - Only players at or above `minToPlace` can place. If fewer placed players than prize places, the unclaimed shares
 *   go to the placed players in proportion to their shares.
 * - Players tied on score pool the prizes for the places they cover and split them equally; leftover cents go to
 *   whoever joined first.
 * - If nobody reaches `minToPlace`, everyone gets their own net entry back.
 */
export function settle(input: { entries: SettleEntry[]; shares: number[]; feeBps: number; minToPlace: number }): Settlement {
  const { entries, feeBps } = input;
  const potCents = entries.reduce((a, e) => a + e.netCents, 0);
  const sorted = [...entries].sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);
  const ranks: Record<string, number> = {};
  sorted.forEach((e, i) => {
    ranks[e.id] = i > 0 && sorted[i - 1].score === e.score ? ranks[sorted[i - 1].id] : i + 1;
  });
  const payouts: Record<string, number> = Object.fromEntries(entries.map((e) => [e.id, 0]));
  const placed = sorted.filter((e) => e.score >= input.minToPlace);

  if (!placed.length) {
    for (const e of entries) payouts[e.id] = e.netCents;
    return { refundAll: true, potCents, feeCents: 0, prizeCents: 0, ranks, payouts };
  }

  const feeCents = Math.floor((potCents * Math.max(0, feeBps)) / 10_000);
  const prizeCents = potCents - feeCents;
  const places = splitCents(prizeCents, input.shares.slice(0, Math.min(input.shares.length, placed.length)));

  // Walk the placed players in tie groups; each group takes the place amounts for the positions it covers.
  let pos = 0;
  while (pos < placed.length && pos < places.length) {
    let end = pos;
    while (end + 1 < placed.length && placed[end + 1].score === placed[pos].score) end++;
    const group = placed.slice(pos, end + 1); // already in join order within a score
    const pool = places.slice(pos, end + 1).reduce((a, b) => a + b, 0);
    splitCents(pool, group.map(() => 1)).forEach((c, i) => (payouts[group[i].id] = c));
    pos = end + 1;
  }
  return { refundAll: false, potCents, feeCents, prizeCents, ranks, payouts };
}
