import { v } from "convex/values";
import { challengeDays, challengeTemplate, dayKey, DURATION_OPTIONS_DAYS, ENTRY_OPTIONS_CENTS, maxPoints, minToPlace, scoreEntry } from "../engine/challenge";
import { COMMUNITY_GROUPS, communitiesFor, diffMemberships, matchCommunities } from "../engine/communityMatch";
import type { Profile } from "../engine/types";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { memberFor, requireMember } from "./members";

/**
 * Together: community rooms, chat and group challenges. Real, shared data.
 * - Rooms are data/communities.json. People are placed in condition rooms from their profile (engine/communityMatch)
 *   once they agree; they can join optional rooms and leave any room (leaving sticks).
 * - Challenge points are computed here from each player's own scans and check-ins (engine/challenge), never stored.
 * - Paid entry needs Whop checkout; until MONEY_CHALLENGES=on, only free challenges can be created.
 */

const DAY = 86_400_000;
const EMPTY: Profile = { medications: [], conditions: [], allergies: [], diets: [] };
const moneyLive = () => process.env.MONEY_CHALLENGES === "on";
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

type PlayerScore = { memberId: Id<"members">; name: string; avatarUrl: string | null; joinedAt: number; score: number; perDay?: Record<string, number> };

async function scorePlayers(ctx: QueryCtx, ch: Doc<"challenges">, meId: Id<"members"> | null): Promise<PlayerScore[]> {
  const t = challengeTemplate(ch.template);
  if (!t) return [];
  const window = { startsAt: ch.startsAt, days: ch.days, tzOffsetMinutes: ch.tzOffsetMinutes };
  const end = ch.startsAt + ch.days * DAY;
  const entries = await ctx.db.query("entries").withIndex("by_challengeId_and_memberId", (q) => q.eq("challengeId", ch._id)).take(100);
  const out: PlayerScore[] = [];
  for (const e of entries) {
    const m = await ctx.db.get("members", e.memberId);
    if (!m) continue;
    let scanTimes: number[] = [];
    if (t.proof === "scans") {
      const scans = await ctx.db.query("scans").withIndex("by_deviceId", (q) => q.eq("deviceId", m.deviceId)).order("desc").take(200);
      scanTimes = scans.filter((s) => s.status === "done" && s._creationTime >= ch.startsAt && s._creationTime < end).map((s) => s._creationTime);
    }
    const rows = await ctx.db
      .query("checkins")
      .withIndex("by_challengeId_and_memberId_and_day", (q) => q.eq("challengeId", ch._id).eq("memberId", m._id))
      .take(60);
    const s = scoreEntry(t, window, scanTimes, rows.map((r) => ({ day: r.day, value: r.value })));
    out.push({ memberId: m._id, name: m.name, avatarUrl: m.avatarUrl ?? null, joinedAt: e.joinedAt, score: s.total, perDay: m._id === meId ? s.perDay : undefined });
  }
  return out;
}

function challengeSummary(ch: Doc<"challenges">) {
  const t = challengeTemplate(ch.template)!;
  return {
    id: ch._id,
    room: ch.room,
    template: ch.template,
    days: ch.days,
    entryCents: ch.entryCents,
    startsAt: ch.startsAt,
    tzOffsetMinutes: ch.tzOffsetMinutes,
    playerCount: ch.playerCount,
    max: maxPoints(t, ch.days),
    needed: minToPlace(t, ch.days),
  };
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
    const rooms = COMMUNITY_GROUPS.map((g) => ({
      slug: g.slug,
      members: counts.get(g.slug) ?? 0,
      reasons: matches.get(g.slug) ?? [],
      source: mine.get(g.slug) ?? null,
    }));

    const challenges = [];
    for (const slug of mine.keys()) {
      const rows = await ctx.db
        .query("challenges")
        .withIndex("by_room_and_startsAt", (q) => q.eq("room", slug).gte("startsAt", now - 31 * DAY))
        .take(10);
      for (const ch of rows) {
        if (ch.startsAt + ch.days * DAY <= now) continue;
        const joined = !!(await ctx.db.query("entries").withIndex("by_challengeId_and_memberId", (q) => q.eq("challengeId", ch._id).eq("memberId", me._id)).unique());
        challenges.push({ ...challengeSummary(ch), joined, players: await scorePlayers(ctx, ch, me._id) });
      }
    }
    return {
      me: { id: me._id, name: me.name, username: me.username, avatarUrl: me.avatarUrl ?? null, autoPlace: me.autoPlace ?? null },
      rooms,
      challenges,
      moneyLive: moneyLive(),
    };
  },
});

export const room = query({
  args: { session: v.string(), room: v.string(), now: v.number() },
  handler: async (ctx, { session, room, now }) => {
    const me = await requireMember(ctx, session);
    if (!isRoom(room)) return null;
    const recent = await ctx.db.query("messages").withIndex("by_room_and_at", (q) => q.eq("room", room)).order("desc").take(100);
    const challenges = await ctx.db
      .query("challenges")
      .withIndex("by_room_and_startsAt", (q) => q.eq("room", room).gte("startsAt", now - 31 * DAY))
      .take(20);
    const live = [];
    for (const ch of challenges) {
      if (ch.startsAt + ch.days * DAY <= now) continue;
      const joined = !!(await ctx.db.query("entries").withIndex("by_challengeId_and_memberId", (q) => q.eq("challengeId", ch._id).eq("memberId", me._id)).unique());
      live.push({ ...challengeSummary(ch), joined, players: await scorePlayers(ctx, ch, me._id) });
    }
    return {
      messages: recent.reverse().map((m) => ({
        id: m._id,
        author: m.name,
        avatarUrl: m.avatarUrl ?? null,
        text: m.text,
        at: m.at,
        mine: m.memberId === me._id,
        dish: m.dish ?? null,
      })),
      challenges: live,
    };
  },
});

export const challenge = query({
  args: { session: v.string(), id: v.id("challenges") },
  handler: async (ctx, { session, id }) => {
    const me = await requireMember(ctx, session);
    const ch = await ctx.db.get("challenges", id);
    if (!ch) return null;
    const players = await scorePlayers(ctx, ch, me._id);
    return { ...challengeSummary(ch), joined: players.some((p) => p.memberId === me._id), players, moneyLive: moneyLive() };
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

const reaction = v.union(v.literal("loved"), v.literal("okay"), v.literal("nope"));

export const send = mutation({
  args: {
    session: v.string(),
    room: v.string(),
    text: v.string(),
    dish: v.optional(v.object({ name: v.string(), place: v.optional(v.string()), reaction })),
  },
  handler: async (ctx, { session, room, text, dish }) => {
    const me = await requireMember(ctx, session);
    const inRoom = await ctx.db.query("roomMembers").withIndex("by_room_and_memberId", (q) => q.eq("room", room).eq("memberId", me._id)).unique();
    if (!inRoom) throw new Error("Join the room to post");
    const body = text.trim().slice(0, 1000);
    if (!body && !dish) return null;
    await ctx.db.insert("messages", {
      room,
      memberId: me._id,
      name: me.name,
      avatarUrl: me.avatarUrl,
      text: body,
      at: Date.now(),
      dish: dish ? { name: dish.name.slice(0, 120), place: dish.place?.slice(0, 120), reaction: dish.reaction } : undefined,
    });
    return null;
  },
});

export const createChallenge = mutation({
  args: { session: v.string(), room: v.string(), template: v.string(), days: v.number(), entryCents: v.number(), startsAt: v.number(), tzOffsetMinutes: v.number() },
  handler: async (ctx, args) => {
    const me = await requireMember(ctx, args.session);
    const inRoom = await ctx.db.query("roomMembers").withIndex("by_room_and_memberId", (q) => q.eq("room", args.room).eq("memberId", me._id)).unique();
    if (!inRoom) throw new Error("Join the room first");
    if (!challengeTemplate(args.template)) throw new Error("Unknown challenge");
    if (!(DURATION_OPTIONS_DAYS as readonly number[]).includes(args.days)) throw new Error("Pick 7, 14 or 30 days");
    if (!(ENTRY_OPTIONS_CENTS as readonly number[]).includes(args.entryCents)) throw new Error("Unsupported entry");
    if (args.entryCents > 0 && !moneyLive()) throw new Error("Paid challenges aren’t switched on yet");
    const now = Date.now();
    if (args.startsAt < now - DAY || args.startsAt > now + 14 * DAY) throw new Error("Start within the next two weeks");
    if (Math.abs(args.tzOffsetMinutes) > 14 * 60) throw new Error("Bad time zone");
    const id = await ctx.db.insert("challenges", {
      room: args.room,
      template: args.template,
      days: args.days,
      entryCents: args.entryCents,
      startsAt: args.startsAt,
      tzOffsetMinutes: args.tzOffsetMinutes,
      createdBy: me._id,
      playerCount: 1,
    });
    await ctx.db.insert("entries", { challengeId: id, memberId: me._id, joinedAt: now });
    return id;
  },
});

export const joinChallenge = mutation({
  args: { session: v.string(), id: v.id("challenges") },
  handler: async (ctx, { session, id }) => {
    const me = await requireMember(ctx, session);
    const ch = await ctx.db.get("challenges", id);
    if (!ch) throw new Error("Challenge not found");
    if (ch.entryCents > 0 && !moneyLive()) throw new Error("Paid challenges aren’t switched on yet");
    if (Date.now() >= ch.startsAt + ch.days * DAY) throw new Error("This challenge has ended");
    const has = await ctx.db.query("entries").withIndex("by_challengeId_and_memberId", (q) => q.eq("challengeId", id).eq("memberId", me._id)).unique();
    if (has) return null;
    await ctx.db.insert("entries", { challengeId: id, memberId: me._id, joinedAt: Date.now() });
    await ctx.db.patch("challenges", id, { playerCount: ch.playerCount + 1 });
    return null;
  },
});

export const leaveChallenge = mutation({
  args: { session: v.string(), id: v.id("challenges") },
  handler: async (ctx, { session, id }) => {
    const me = await requireMember(ctx, session);
    const ch = await ctx.db.get("challenges", id);
    if (!ch) return null;
    const has = await ctx.db.query("entries").withIndex("by_challengeId_and_memberId", (q) => q.eq("challengeId", id).eq("memberId", me._id)).unique();
    if (!has) return null;
    await ctx.db.delete("entries", has._id);
    await ctx.db.patch("challenges", id, { playerCount: Math.max(0, ch.playerCount - 1) });
    return null;
  },
});

/** A daily check-in, for today or yesterday only (in the challenge's time zone), while the challenge runs. */
export const checkIn = mutation({
  args: { session: v.string(), id: v.id("challenges"), day: v.string(), value: v.union(v.literal("yes"), v.literal("no")) },
  handler: async (ctx, { session, id, day, value }) => {
    const me = await requireMember(ctx, session);
    const ch = await ctx.db.get("challenges", id);
    if (!ch) throw new Error("Challenge not found");
    const now = Date.now();
    const allowed = [dayKey(now, ch.tzOffsetMinutes), dayKey(now - DAY, ch.tzOffsetMinutes)];
    if (!allowed.includes(day) || !challengeDays(ch.startsAt, ch.days, ch.tzOffsetMinutes).includes(day)) throw new Error("You can check in for today or yesterday");
    const entry = await ctx.db.query("entries").withIndex("by_challengeId_and_memberId", (q) => q.eq("challengeId", id).eq("memberId", me._id)).unique();
    if (!entry) throw new Error("Join the challenge first");
    const existing = await ctx.db
      .query("checkins")
      .withIndex("by_challengeId_and_memberId_and_day", (q) => q.eq("challengeId", id).eq("memberId", me._id).eq("day", day))
      .unique();
    if (existing) await ctx.db.patch("checkins", existing._id, { value });
    else await ctx.db.insert("checkins", { challengeId: id, memberId: me._id, day, value });
    return null;
  },
});
