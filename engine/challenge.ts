import challengesJson from "../data/challenges.json";

/** Group challenge scoring and payouts. Pure: every amount is integer cents, every rounding rule is written here. */

export type ChallengeTemplate = {
  id: string;
  title: string;
  blurb: string;
  proof: "scans" | "checkin";
  count: "days" | "scans";
  perDayMax: number;
  minToPlacePct: number;
};

export const CHALLENGE_TEMPLATES = challengesJson.templates as ChallengeTemplate[];

export function challengeTemplate(id: string): ChallengeTemplate | undefined {
  return CHALLENGE_TEMPLATES.find((t) => t.id === id);
}

/** Entry fees a challenge may charge, in cents. 0 is a free challenge. */
export const ENTRY_OPTIONS_CENTS = [0, 500, 1000, 2500] as const;
export const DURATION_OPTIONS_DAYS = [7, 14, 30] as const;

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

export function maxPoints(t: ChallengeTemplate, days: number): number {
  return t.perDayMax * days;
}

/** Points needed to place: a share of the maximum, rounded up. */
export function minToPlace(t: ChallengeTemplate, days: number): number {
  return Math.ceil((maxPoints(t, days) * t.minToPlacePct) / 100);
}

export type Checkin = { day: string; value: "yes" | "no" };

/** One player's points per challenge day and in total. Scans and check-ins outside the challenge's days count for nothing. */
export function scoreEntry(
  t: ChallengeTemplate,
  window: { startsAt: number; days: number; tzOffsetMinutes: number },
  scanTimes: number[],
  checkins: Checkin[],
): { perDay: Record<string, number>; total: number } {
  const days = challengeDays(window.startsAt, window.days, window.tzOffsetMinutes);
  const perDay: Record<string, number> = Object.fromEntries(days.map((d) => [d, 0]));
  if (t.proof === "scans") {
    for (const ms of scanTimes) {
      const d = dayKey(ms, window.tzOffsetMinutes);
      if (d in perDay) perDay[d] += 1;
    }
  } else {
    const yes = new Set(checkins.filter((c) => c.value === "yes").map((c) => c.day));
    for (const d of days) if (yes.has(d)) perDay[d] = 1;
  }
  let total = 0;
  for (const d of days) {
    perDay[d] = t.count === "days" ? Math.min(perDay[d], 1) : Math.min(perDay[d], t.perDayMax);
    total += perDay[d];
  }
  return { perDay, total };
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
