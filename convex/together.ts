import { v } from "convex/values";
import { DURATION_OPTIONS_DAYS, scoreMeals, validEntryCents, type Meal, type MealScore } from "../engine/challenge";
import { COMMUNITY_GROUPS, communitiesFor, diffMemberships, matchCommunities } from "../engine/communityMatch";
import type { Fit, Profile } from "../engine/types";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { memberFor, requireMember } from "./members";

/**
 * Together: community rooms, chat and group challenges. Real, shared data.
 * - Rooms are data/communities.json. People are placed in condition rooms from their profile (engine/communityMatch)
 *   once they agree; they can join optional rooms and leave any room (leaving sticks).
 * - Challenge points (the points race) are computed here from each player's own scans and check-ins (engine/challenge), never stored.
 * - A race can be free, or every player pays the same entry and the winner takes the pool. The money is in
 *   convex/pay.ts; until MONEY_CHALLENGES=on, only free races can be created.
 */

export const DAY = 86_400_000;
/** A money race is settled this long after it ends, so a scan still finishing its verdicts counts as it ends up. */
const SETTLE_GRACE_MS = 60 * 60_000;
/** Seen within this long counts as online now. The app sends a heartbeat every 45 s while open. */
const ONLINE_MS = 2 * 60_000;
const EMPTY: Profile = { medications: [], conditions: [], allergies: [], diets: [] };
export const moneyLive = () => process.env.MONEY_CHALLENGES === "on";
/** Our own cut of a money race's pool, in hundredths of a percent (CHALLENGE_FEE_BPS, 0 unless set). */
export const feeBps = () => Math.min(10_000, Math.max(0, Math.floor(Number(process.env.CHALLENGE_FEE_BPS ?? 0)) || 0));
const isRoom = (slug: string) => COMMUNITY_GROUPS.some((g) => g.slug === slug);

async function profileOf(ctx: QueryCtx | MutationCtx, deviceId: string): Promise<Profile> {
  const row = await ctx.db.query("profiles").withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId)).unique();
  return row?.profile ?? EMPTY;
}

async function myRoomRows(ctx: QueryCtx | MutationCtx, memberId: Id<"members">) {
  return await ctx.db.query("roomMembers").withIndex("by_memberId", (q) => q.eq("memberId", memberId)).take(50);
}

async function bumpCount(ctx: MutationCtx, slug: string, by: number) {
  const row = await ctx.db.query("rooms").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
  if (row) await ctx.db.patch("rooms", row._id, { memberCount: Math.max(0, row.memberCount + by) });
  else await ctx.db.insert("rooms", { slug, memberCount: Math.max(0, by) });
}

async function addToRoom(ctx: MutationCtx, memberId: Id<"members">, room: string, source: "auto" | "manual") {
  const existing = await ctx.db.query("roomMembers").withIndex("by_room_and_memberId", (q) => q.eq("room", room).eq("memberId", memberId)).unique();
  if (existing) return;
  await ctx.db.insert("roomMembers", { room, memberId, source, joinedAt: Date.now() });
  await bumpCount(ctx, room, 1);
}

async function removeFromRoom(ctx: MutationCtx, memberId: Id<"members">, room: string) {
  const existing = await ctx.db.query("roomMembers").withIndex("by_room_and_memberId", (q) => q.eq("room", room).eq("memberId", memberId)).unique();
  if (!existing) return;
  await ctx.db.delete("roomMembers", existing._id);
  await bumpCount(ctx, room, -1);
}

async function optOuts(ctx: QueryCtx | MutationCtx, memberId: Id<"members">): Promise<string[]> {
  const rows = await ctx.db.query("roomOptOuts").withIndex("by_memberId_and_room", (q) => q.eq("memberId", memberId)).take(50);
  return rows.map((r) => r.room);
}

/** Bring a member's automatic rooms in line with their profile. Rooms they joined by hand are never touched. */
async function syncRooms(ctx: MutationCtx, member: Doc<"members">) {
  if (!member.autoPlace) return;
  const target = communitiesFor(await profileOf(ctx, member.deviceId)).map((m) => m.slug);
  const current = (await myRoomRows(ctx, member._id)).map((r) => ({ slug: r.room, source: r.source }));
  const { join, leave } = diffMemberships(current, target, await optOuts(ctx, member._id));
  for (const slug of join) await addToRoom(ctx, member._id, slug, "auto");
  for (const slug of leave) await removeFromRoom(ctx, member._id, slug);
}

/** Called when a device's profile is saved, so rooms follow conditions as they change. */
export async function syncRoomsForDevice(ctx: MutationCtx, deviceId: string) {
  const members = await ctx.db.query("members").withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId)).take(5);
  for (const m of members) await syncRooms(ctx, m);
}

// ── Challenge scoring ─────────────────────────────────────────────────────────────────────────────────────────────

type PlayerScore = MealScore & {
  memberId: Id<"members">;
  name: string;
  avatarUrl: string | null;
  joinedAt: number;
};

/** A device's meals in a time window, each with its dish name and the fit its scan shows now. */
async function mealsOf(ctx: QueryCtx, deviceId: string, from: number, to: number): Promise<Meal[]> {
  const rows = await ctx.db
    .query("meals")
    .withIndex("by_deviceId_and_at", (q) => q.eq("deviceId", deviceId).gte("at", from).lt("at", to))
    .take(200);
  const out: Meal[] = [];
  for (const m of rows) {
    const scan = await ctx.db.get("scans", m.scanId);
    out.push({ at: m.at, dish: m.dishName, fit: scan?.verdicts[m.itemId]?.fit ?? "cant_tell" });
  }
  return out;
}

/** A challenge's entries, oldest first. Bounded: a race holds 50 players, plus people part-way through paying. */
export async function entriesOf(ctx: QueryCtx | MutationCtx, ch: Doc<"challenges">): Promise<Doc<"entries">[]> {
  return await ctx.db.query("entries").withIndex("by_challengeId_and_memberId", (q) => q.eq("challengeId", ch._id)).take(200);
}

/** Who is racing: everyone in a free race, only those whose payment arrived in a money race. */
const racing = (ch: Doc<"challenges">, entries: Doc<"entries">[]) => (ch.entryCents > 0 ? entries.filter((e) => e.status === "paid") : entries);

export async function scorePlayers(ctx: QueryCtx | MutationCtx, ch: Doc<"challenges">, entries: Doc<"entries">[]): Promise<PlayerScore[]> {
  const window = { startsAt: ch.startsAt, days: ch.days, tzOffsetMinutes: ch.tzOffsetMinutes };
  const end = ch.startsAt + ch.days * DAY;
  const out: PlayerScore[] = [];
  for (const e of racing(ch, entries)) {
    const m = await ctx.db.get("members", e.memberId);
    if (!m) continue;
    const s = scoreMeals(await mealsOf(ctx, m.deviceId, ch.startsAt, end), window);
    out.push({ memberId: m._id, name: m.name, avatarUrl: m.avatarUrl ?? null, joinedAt: e.joinedAt, ...s });
  }
  return out;
}

/** A challenge as one member sees it: the race, the money in it, and where they stand with their own entry. */
async function challengeFor(ctx: QueryCtx, ch: Doc<"challenges">, meId: Id<"members">) {
  const entries = await entriesOf(ctx, ch);
  const mine = entries.find((e) => e.memberId === meId);
  const paid = ch.entryCents > 0;
  // Latest money owed to me in this race: a prize, or my entry coming back.
  const owed = paid ? await ctx.db.query("payouts").withIndex("by_challengeId_and_memberId", (q) => q.eq("challengeId", ch._id).eq("memberId", meId)).order("desc").first() : null;
  const pot = ch.settlement?.potCents ?? racing(ch, entries).reduce((a, e) => a + (e.netCents ?? 0), 0);
  return {
    id: ch._id,
    days: ch.days,
    startsAt: ch.startsAt,
    tzOffsetMinutes: ch.tzOffsetMinutes,
    playerCount: ch.playerCount,
    entryCents: ch.entryCents,
    // What has reached the pool so far, after Whop's fee; once settled, the pool it was settled on.
    potCents: pot,
    // What the winner would take from that pool: after our own cut, if any.
    prizeCents: ch.settlement?.prizeCents ?? pot - Math.floor((pot * feeBps()) / 10_000),
    settlement: ch.settlement ?? null,
    joined: Boolean(mine) && !(paid && mine?.status !== "paid"),
    // I started paying and Whop has not confirmed it (or I never finished).
    pending: paid && mine?.status === "pending",
    payout: owed ? { kind: owed.kind, cents: owed.cents, status: owed.status } : null,
    players: await scorePlayers(ctx, ch, entries),
  };
}

/** How many of a room's members had the app open within ONLINE_MS of `now`. */
async function onlineIn(ctx: QueryCtx, room: string, now: number): Promise<number> {
  let n = 0;
  for (const r of await ctx.db.query("roomMembers").withIndex("by_room_and_memberId", (q) => q.eq("room", room)).take(500)) {
    const p = await ctx.db.query("presence").withIndex("by_memberId", (q) => q.eq("memberId", r.memberId)).unique();
    if (p && now - p.lastSeenAt < ONLINE_MS) n++;
  }
  return n;
}

// ── Queries ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Everything the Together tab needs. `now` comes from the phone (queries cannot read the clock). */
export const home = query({
  args: { session: v.string(), now: v.number() },
  handler: async (ctx, { session, now }) => {
    const me = await memberFor(ctx, session);
    if (!me) return null;
    const profile = await profileOf(ctx, me.deviceId);
    const matches = new Map(matchCommunities(profile).map((m) => [m.slug, m.reasons]));
    const mine = new Map((await myRoomRows(ctx, me._id)).map((r) => [r.room, r.source]));
    const counts = new Map((await ctx.db.query("rooms").take(100)).map((r) => [r.slug, r.memberCount]));
    const rooms = [];
    for (const g of COMMUNITY_GROUPS) {
      rooms.push({
        slug: g.slug,
        members: counts.get(g.slug) ?? 0,
        // Real people with the app open in the last two minutes; only counted for your own rooms.
        online: mine.has(g.slug) ? await onlineIn(ctx, g.slug, now) : 0,
        reasons: matches.get(g.slug) ?? [],
        source: mine.get(g.slug) ?? null,
      });
    }

    const challenges = [];
    for (const e of await ctx.db.query("entries").withIndex("by_memberId", (q) => q.eq("memberId", me._id)).order("desc").take(20)) {
      const ch = await ctx.db.get("challenges", e.challengeId);
      if (!ch || ch.startsAt + ch.days * DAY + 3 * DAY <= now) continue;
      challenges.push(await challengeFor(ctx, ch, me._id));
    }
    return {
      me: { id: me._id, name: me.name, username: me.username, avatarUrl: me.avatarUrl ?? null, autoPlace: me.autoPlace ?? null },
      rooms,
      challenges,
      moneyLive: moneyLive(),
    };
  },
});

export const challenge = query({
  args: { session: v.string(), id: v.id("challenges") },
  handler: async (ctx, { session, id }) => {
    const me = await requireMember(ctx, session);
    const ch = await ctx.db.get("challenges", id);
    if (!ch) return null;
    return await challengeFor(ctx, ch, me._id);
  },
});

// ── Mutations ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Answer the placement question. `skip` lists matched rooms the person switched off. */
export const setAutoPlace = mutation({
  args: { session: v.string(), on: v.boolean(), skip: v.array(v.string()) },
  handler: async (ctx, { session, on, skip }) => {
    const me = await requireMember(ctx, session);
    for (const room of skip.filter(isRoom)) {
      const has = await ctx.db.query("roomOptOuts").withIndex("by_memberId_and_room", (q) => q.eq("memberId", me._id).eq("room", room)).unique();
      if (!has) await ctx.db.insert("roomOptOuts", { memberId: me._id, room });
    }
    await ctx.db.patch("members", me._id, { autoPlace: on });
    await syncRooms(ctx, { ...me, autoPlace: on });
    return null;
  },
});

export const joinRoom = mutation({
  args: { session: v.string(), room: v.string() },
  handler: async (ctx, { session, room }) => {
    const me = await requireMember(ctx, session);
    if (!isRoom(room)) throw new Error("No such room");
    const out = await ctx.db.query("roomOptOuts").withIndex("by_memberId_and_room", (q) => q.eq("memberId", me._id).eq("room", room)).unique();
    if (out) await ctx.db.delete("roomOptOuts", out._id);
    await addToRoom(ctx, me._id, room, "manual");
    return null;
  },
});

/** Leaving records an opt-out, so automatic placement never re-adds the room. */
export const leaveRoom = mutation({
  args: { session: v.string(), room: v.string() },
  handler: async (ctx, { session, room }) => {
    const me = await requireMember(ctx, session);
    if (!isRoom(room)) throw new Error("No such room");
    await removeFromRoom(ctx, me._id, room);
    const has = await ctx.db.query("roomOptOuts").withIndex("by_memberId_and_room", (q) => q.eq("memberId", me._id).eq("room", room)).unique();
    if (!has) await ctx.db.insert("roomOptOuts", { memberId: me._id, room });
    return null;
  },
});

/**
 * Start a race. Free: the creator is in at once. Money (`entryCents` > 0): nobody is in until they have paid,
 * the creator included; the creator gets a pending entry so the race shows on their Together tab, and the pool is
 * scheduled to settle after the end.
 */
export const createChallenge = mutation({
  args: { session: v.string(), days: v.number(), startsAt: v.number(), tzOffsetMinutes: v.number(), entryCents: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const me = await requireMember(ctx, args.session);
    if (!(DURATION_OPTIONS_DAYS as readonly number[]).includes(args.days)) throw new Error("Pick 3, 7 or 14 days");
    const now = Date.now();
    if (args.startsAt < now - DAY || args.startsAt > now + 14 * DAY) throw new Error("Start within the next two weeks");
    if (Math.abs(args.tzOffsetMinutes) > 14 * 60) throw new Error("Bad time zone");
    const entryCents = args.entryCents ?? 0;
    const paid = entryCents > 0;
    if (paid) {
      if (!moneyLive()) throw new Error("Money races are not switched on yet");
      if (!validEntryCents(entryCents)) throw new Error("Pick an entry between $1 and $100, in whole dollars");
      // Everyone has to be able to pay before the first dish counts.
      if (args.startsAt <= now) throw new Error("A money race has to start on a later day, so everyone can pay in first");
    } else if (entryCents !== 0) throw new Error("Bad entry");
    const id = await ctx.db.insert("challenges", {
      days: args.days,
      startsAt: args.startsAt,
      tzOffsetMinutes: args.tzOffsetMinutes,
      createdBy: me._id,
      playerCount: paid ? 0 : 1,
      entryCents,
    });
    await ctx.db.insert("entries", { challengeId: id, memberId: me._id, joinedAt: now, ...(paid ? { status: "pending" as const } : {}) });
    if (paid) await ctx.scheduler.runAt(args.startsAt + args.days * DAY + SETTLE_GRACE_MS, internal.pay.settle, { id });
    return id;
  },
});

/** Join a free race from an invite link. A money race is joined by paying (pay.checkout). */
export const joinChallenge = mutation({
  args: { session: v.string(), id: v.id("challenges") },
  handler: async (ctx, { session, id }) => {
    const me = await requireMember(ctx, session);
    const ch = await ctx.db.get("challenges", id);
    if (!ch) throw new Error("Challenge not found");
    if (ch.entryCents > 0) throw new Error("This race has an entry to pay first");
    if (Date.now() >= ch.startsAt + ch.days * DAY) throw new Error("This challenge has ended");
    if (ch.playerCount >= 50) throw new Error("This challenge is full");
    const has = await ctx.db.query("entries").withIndex("by_challengeId_and_memberId", (q) => q.eq("challengeId", id).eq("memberId", me._id)).unique();
    if (has) return null;
    await ctx.db.insert("entries", { challengeId: id, memberId: me._id, joinedAt: Date.now() });
    await ctx.db.patch("challenges", id, { playerCount: ch.playerCount + 1 });
    return null;
  },
});

/**
 * Leave a race. In a money race: before the start a paid entry is refunded; once it has started the pool is locked
 * and nobody can leave. An entry that was never paid can always be dropped.
 */
export const leaveChallenge = mutation({
  args: { session: v.string(), id: v.id("challenges") },
  handler: async (ctx, { session, id }) => {
    const me = await requireMember(ctx, session);
    const ch = await ctx.db.get("challenges", id);
    if (!ch) return null;
    const has = await ctx.db.query("entries").withIndex("by_challengeId_and_memberId", (q) => q.eq("challengeId", id).eq("memberId", me._id)).unique();
    if (!has) return null;
    if (has.status === "pending") {
      await ctx.db.delete("entries", has._id);
      return null;
    }
    if (has.status === "paid") {
      if (Date.now() >= ch.startsAt) throw new Error("A money race can't be left once it has started");
      if (has.paymentId) await ctx.runMutation(internal.pay.refundEntry, { challengeId: id, memberId: me._id, paymentId: has.paymentId, cents: has.grossCents ?? ch.entryCents });
    }
    await ctx.db.delete("entries", has._id);
    await ctx.db.patch("challenges", id, { playerCount: Math.max(0, ch.playerCount - 1) });
    return null;
  },
});

/** The app is open. Sent every 45 s while signed in. */
export const heartbeat = mutation({
  args: { session: v.string() },
  handler: async (ctx, { session }) => {
    const me = await memberFor(ctx, session);
    if (!me) return null;
    const row = await ctx.db.query("presence").withIndex("by_memberId", (q) => q.eq("memberId", me._id)).unique();
    if (row) await ctx.db.patch("presence", row._id, { lastSeenAt: Date.now() });
    else await ctx.db.insert("presence", { memberId: me._id, lastSeenAt: Date.now() });
    return null;
  },
});

// ── Meals ("I ordered this") ──────────────────────────────────────────────────────────────────────────────────────

/** The dish logged from a scan, if any. Device-keyed like scans, so it works before signing in. */
export const mealForScan = query({
  args: { deviceId: v.string(), scanId: v.id("scans") },
  handler: async (ctx, { deviceId, scanId }) => {
    const row = await ctx.db.query("meals").withIndex("by_scanId", (q) => q.eq("scanId", scanId)).first();
    return row && row.deviceId === deviceId ? { itemId: row.itemId, dishName: row.dishName } : null;
  },
});

/** Log (or change) what was ordered from a scan. One meal per scan. Returns the dish's fit for the celebration. */
export const logMeal = mutation({
  args: { deviceId: v.string(), scanId: v.id("scans"), itemId: v.string() },
  handler: async (ctx, { deviceId, scanId, itemId }) => {
    const scan = await ctx.db.get("scans", scanId);
    if (!scan || scan.deviceId !== deviceId) throw new Error("Scan not found");
    const item = scan.items.find((i) => i.id === itemId);
    if (!item) throw new Error("Dish not found");
    const existing = await ctx.db.query("meals").withIndex("by_scanId", (q) => q.eq("scanId", scanId)).first();
    if (existing) await ctx.db.patch("meals", existing._id, { itemId, dishName: item.name });
    else await ctx.db.insert("meals", { deviceId, scanId, itemId, dishName: item.name, at: Date.now() });
    return { fit: (scan.verdicts[itemId]?.fit ?? "cant_tell") as Fit };
  },
});
