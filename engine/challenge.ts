import type { Fit } from "./types";

/**
 * "Eat what fits": a challenge between friends.
 * After a scan, a player taps the dish they ordered. Each meal counts by how well it fits that player's own needs
 * (the same verdict the app shows them): Good fit is a full point, Okay with notes half, Not a fit nothing. The score
 * is the share of meals that fit, as a percentage, so ordering well wins, not scanning the most. A player needs a
 * minimum number of meals to qualify. Pure: amounts are integer cents, every rounding rule is written here.
 */

export const CHALLENGE_NAME = "Eat what fits";

export const DURATION_OPTIONS_DAYS = [3, 7, 14] as const;

/** Points per meal, out of 2. "Can't tell" meals do not count either way. */
export const MEAL_POINTS: Record<Fit, number> = { good: 2, okay: 1, not_fit: 0, cant_tell: 0 };

/** Meals needed to qualify: about one every other day, at least three. */
export function minMeals(days: number): number {
  return Math.max(3, Math.ceil(days / 2));
}

/** At most this many meals count per day, so a day of snacks cannot swamp a week. */
export const MEALS_PER_DAY = 3;

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

export type Meal = { at: number; fit: Fit };

export type MealScore = {
  /** Meals that counted (inside the challenge, at most MEALS_PER_DAY a day, "can't tell" left out). */
  meals: number;
  good: number;
  okay: number;
  notFit: number;
  /** 0–100, the share of points out of the most possible; null with no counted meals. */
  score: number | null;
  qualified: boolean;
  /** The counted meals' fits per challenge day, in order eaten. */
  perDay: Record<string, Fit[]>;
};

export function scoreMeals(meals: Meal[], window: { startsAt: number; days: number; tzOffsetMinutes: number }): MealScore {
  const days = challengeDays(window.startsAt, window.days, window.tzOffsetMinutes);
  const perDay: Record<string, Fit[]> = Object.fromEntries(days.map((d) => [d, []]));
  for (const m of [...meals].sort((a, b) => a.at - b.at)) {
    if (m.fit === "cant_tell") continue;
    const d = dayKey(m.at, window.tzOffsetMinutes);
    if (d in perDay && perDay[d].length < MEALS_PER_DAY) perDay[d].push(m.fit);
  }
  const counted = days.flatMap((d) => perDay[d]);
  const points = counted.reduce((a, f) => a + MEAL_POINTS[f], 0);
  return {
    meals: counted.length,
    good: counted.filter((f) => f === "good").length,
    okay: counted.filter((f) => f === "okay").length,
    notFit: counted.filter((f) => f === "not_fit").length,
    score: counted.length ? Math.round((points / (counted.length * 2)) * 100) : null,
    qualified: counted.length >= minMeals(window.days),
    perDay,
  };
}

export type RankInput = { id: string; score: number | null; meals: number; qualified: boolean; joinedAt: number };

/**
 * Leaderboard order: qualified players first, by score, then by more meals; then everyone else the same way.
 * Players level on all of that share a rank (1, 1, 3).
 */
export function rankPlayers(players: RankInput[]): Record<string, number> {
  const key = (p: RankInput) => [p.qualified ? 1 : 0, p.score ?? -1, p.meals] as const;
  const sorted = [...players].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return kb[0] - ka[0] || kb[1] - ka[1] || kb[2] - ka[2] || a.joinedAt - b.joinedAt;
  });
  const ranks: Record<string, number> = {};
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1];
    const same = prev && key(prev).every((v, j) => v === key(p)[j]);
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
