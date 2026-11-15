import { v } from "convex/values";
import rooms from "../data/whopRooms.json";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, mutation, query, type QueryCtx } from "./_generated/server";
import { requireMember } from "./members";
import { accountId, whop } from "./pay";
import { DAY } from "./together";

/**
 * Inviting friends to a race inside the app. "Friends" are Whop people known to Fit: anyone signed in to the app,
 * members of the Fit business on Whop, and anyone who has posted in a room. You find them by Whop name or username,
 * or pick from people you have raced with before. An invite is addressed to a Whop user id, so it can be sent to
 * someone who has not opened the app yet; it shows on their Together tab once they are signed in, until they are in
 * the race, they decline, or the race closes.
 *
 * Only what Whop shows publicly is ever kept or shown: user id, username, name and picture. Nothing from a profile,
 * and never the email that Whop's member records carry.
 */

/** Most invites one person can send for one race. */
const MAX_INVITES = 50;
/** Most people kept from one sync of Whop. */
const MAX_DIRECTORY = 1000;

type Found = { whopUserId: string; name: string; username: string; avatarUrl: string | null };

/** Whether new players can still get in: a free race until it ends, a money race until it starts. */
function open(ch: Doc<"challenges">, now: number): boolean {
  if (ch.settledAt) return false;
  return ch.entryCents > 0 ? now < ch.startsAt : now < ch.startsAt + ch.days * DAY;
}

async function entryOf(ctx: QueryCtx, challengeId: Id<"challenges">, memberId: Id<"members">) {
  return await ctx.db.query("entries").withIndex("by_challengeId_and_memberId", (q) => q.eq("challengeId", challengeId).eq("memberId", memberId)).unique();
}

/** The entry of a Whop user in a race, if they have signed in to the app and have one. */
async function entryOfWhopUser(ctx: QueryCtx, challengeId: Id<"challenges">, whopUserId: string) {
  const member = await ctx.db.query("members").withIndex("by_whopUserId", (q) => q.eq("whopUserId", whopUserId)).unique();
  return member ? await entryOf(ctx, challengeId, member._id) : null;
}

async function inviteOf(ctx: QueryCtx, challengeId: Id<"challenges">, whopUserId: string) {
  return await ctx.db.query("invites").withIndex("by_toWhopUserId_and_challengeId", (q) => q.eq("toWhopUserId", whopUserId).eq("challengeId", challengeId)).first();
}

const fromMember = (m: Doc<"members">): Found => ({ whopUserId: m.whopUserId, name: m.name, username: m.username, avatarUrl: m.avatarUrl ?? null });
const fromDirectory = (p: Doc<"whopPeople">): Found => ({ whopUserId: p.whopUserId, name: p.name, username: p.username, avatarUrl: p.avatarUrl ?? null });

/** People I have been in a race with, most recent races first. */
async function racedWith(ctx: QueryCtx, meId: Id<"members">): Promise<Found[]> {
  const seen = new Set<string>([meId]);
  const out: Found[] = [];
  for (const mine of await ctx.db.query("entries").withIndex("by_memberId", (q) => q.eq("memberId", meId)).order("desc").take(8)) {
    for (const e of await ctx.db.query("entries").withIndex("by_challengeId_and_memberId", (q) => q.eq("challengeId", mine.challengeId)).take(20)) {
      if (seen.has(e.memberId)) continue;
      seen.add(e.memberId);
      const m = await ctx.db.get("members", e.memberId);
      if (m) out.push(fromMember(m));
      if (out.length >= 12) return out;
    }
  }
  return out;
}

/** Whop people whose name or username matches: those signed in to the app first, then the rest Fit knows of. */
async function search(ctx: QueryCtx, text: string): Promise<Found[]> {
  const found: Found[] = [
    ...(await ctx.db.query("members").withSearchIndex("search_username", (s) => s.search("username", text)).take(8)).map(fromMember),
    ...(await ctx.db.query("members").withSearchIndex("search_name", (s) => s.search("name", text)).take(8)).map(fromMember),
    ...(await ctx.db.query("whopPeople").withSearchIndex("search_username", (s) => s.search("username", text)).take(8)).map(fromDirectory),
    ...(await ctx.db.query("whopPeople").withSearchIndex("search_name", (s) => s.search("name", text)).take(8)).map(fromDirectory),
  ];
  const seen = new Set<string>();
  return found.filter((p) => !seen.has(p.whopUserId) && Boolean(seen.add(p.whopUserId))).slice(0, 12);
}

/**
 * Who I could invite to a race. With two or more letters typed: Whop people whose name or username matches. With
 * nothing typed: people I have raced with before. Each says whether they are already in or already invited.
 * `id` is their Whop user id.
 */
export const people = query({
  args: { session: v.string(), id: v.id("challenges"), q: v.string() },
  handler: async (ctx, { session, id, q }) => {
    const me = await requireMember(ctx, session);
    const text = q.trim().replace(/^@/, "").slice(0, 40);
    const found = text.length >= 2 ? await search(ctx, text) : await racedWith(ctx, me._id);
    const out = [];
    for (const p of found) {
      if (p.whopUserId === me.whopUserId) continue;
      const entry = await entryOfWhopUser(ctx, id, p.whopUserId);
      const racing = entry && entry.status !== "pending";
      const state = racing ? ("in" as const) : entry || (await inviteOf(ctx, id, p.whopUserId)) ? ("invited" as const) : null;
      out.push({ id: p.whopUserId, name: p.name, username: p.username, avatarUrl: p.avatarUrl, state });
    }
    return out;
  },
});

/** Invite a Whop person to a race I am part of. Inviting someone already in or already invited does nothing. */
export const send = mutation({
  args: { session: v.string(), id: v.id("challenges"), to: v.string() },
  handler: async (ctx, { session, id, to }) => {
    const me = await requireMember(ctx, session);
    const ch = await ctx.db.get("challenges", id);
    if (!ch) throw new Error("Challenge not found");
    if (!(await entryOf(ctx, id, me._id))) throw new Error("Join this race before inviting people to it");
    if (!open(ch, Date.now())) throw new Error("This race is closed to new players");
    // Only people we know from Whop can be named: no inviting an arbitrary id.
    const known =
      (await ctx.db.query("members").withIndex("by_whopUserId", (q) => q.eq("whopUserId", to)).unique()) ??
      (await ctx.db.query("whopPeople").withIndex("by_whopUserId", (q) => q.eq("whopUserId", to)).unique());
    if (to === me.whopUserId || !known) throw new Error("Can't invite that person");
    if ((await entryOfWhopUser(ctx, id, to)) || (await inviteOf(ctx, id, to))) return null;
    const sent = await ctx.db.query("invites").withIndex("by_challengeId_and_fromId", (q) => q.eq("challengeId", id).eq("fromId", me._id)).take(MAX_INVITES);
    if (sent.length >= MAX_INVITES) throw new Error(`That is the most invites for one race (${MAX_INVITES})`);
    await ctx.db.insert("invites", { challengeId: id, fromId: me._id, toWhopUserId: to, at: Date.now() });
    return null;
  },
});

/** Races I have been invited to and can still get into. `now` comes from the phone (queries cannot read the clock). */
export const mine = query({
  args: { session: v.string(), now: v.number() },
  handler: async (ctx, { session, now }) => {
    const me = await requireMember(ctx, session);
    const out = [];
    for (const inv of await ctx.db.query("invites").withIndex("by_toWhopUserId_and_challengeId", (q) => q.eq("toWhopUserId", me.whopUserId)).order("desc").take(20)) {
      const ch = await ctx.db.get("challenges", inv.challengeId);
      if (!ch || !open(ch, now) || (await entryOf(ctx, ch._id, me._id))) continue;
      const from = await ctx.db.get("members", inv.fromId);
      out.push({
        id: ch._id,
        days: ch.days,
        startsAt: ch.startsAt,
        entryCents: ch.entryCents,
        playerCount: ch.playerCount,
        at: inv.at,
        from: { name: from?.name ?? "Someone", avatarUrl: from?.avatarUrl ?? null },
      });
      if (out.length >= 5) break;
    }
    return out.sort((a, b) => b.at - a.at);
  },
});

/** Say no to an invite: it stops showing. The race can still be joined from a link. */
export const decline = mutation({
  args: { session: v.string(), id: v.id("challenges") },
  handler: async (ctx, { session, id }) => {
    const me = await requireMember(ctx, session);
    for (const inv of await ctx.db.query("invites").withIndex("by_toWhopUserId_and_challengeId", (q) => q.eq("toWhopUserId", me.whopUserId).eq("challengeId", id)).take(10)) {
      await ctx.db.delete("invites", inv._id);
    }
    return null;
  },
});

// ── The directory of Whop people ──────────────────────────────────────────────────────────────────────────────────

type WhopUser = { id?: unknown; username?: unknown; name?: unknown; profile_picture?: unknown } | null | undefined;

/** Keep only what is shown about a person. A deleted Whop account is left out. */
function person(u: WhopUser): { whopUserId: string; username: string; name: string; avatarUrl?: string } | null {
  if (!u || typeof u.id !== "string" || typeof u.username !== "string" || !u.username) return null;
  const name = typeof u.name === "string" && u.name.trim() ? u.name.trim() : u.username;
  if (name === "Deleted user") return null;
  const picture = typeof u.profile_picture === "string" ? u.profile_picture : (u.profile_picture as { url?: unknown } | null | undefined)?.url;
  return { whopUserId: u.id, username: u.username, name, ...(typeof picture === "string" && picture ? { avatarUrl: picture } : {}) };
}

/**
 * Copy who can be invited from Whop: members of the Fit business, and whoever wrote the recent posts in each room.
 * Runs every few minutes (convex/crons.ts). Does nothing until the Whop key and account are set on the deployment.
 */
export const syncDirectory = internalAction({
  args: {},
  handler: async (ctx) => {
    if (!process.env.WHOP_API_KEY || !process.env.WHOP_ACCOUNT_ID) return null;
    const people = new Map<string, NonNullable<ReturnType<typeof person>>>();
    const add = (u: WhopUser) => {
      const p = person(u);
      // A member record has the picture and a forum post does not, so the first one seen with a picture wins.
      if (p && people.size < MAX_DIRECTORY && !(people.get(p.whopUserId)?.avatarUrl)) people.set(p.whopUserId, { ...people.get(p.whopUserId), ...p });
    };
    try {
      let after: string | null = null;
      for (let page = 0; page < 5; page++) {
        const res: { data?: { user?: WhopUser }[]; page_info?: { has_next_page?: boolean; end_cursor?: string | null } } = await whop(
          `/members?account_id=${accountId()}&first=100${after ? `&after=${encodeURIComponent(after)}` : ""}`,
        );
        for (const m of res.data ?? []) add(m.user);
        after = res.page_info?.has_next_page ? (res.page_info.end_cursor ?? null) : null;
        if (!after) break;
      }
    } catch (e) {
      console.error(`Could not list Whop members: ${e instanceof Error ? e.message : e}`);
    }
    for (const [slug, room] of Object.entries(rooms as Record<string, { forumId?: string }>)) {
      if (slug.startsWith("_") || !room.forumId) continue;
      try {
        const res = await whop<{ data?: { user?: WhopUser }[] }>(`/forum_posts?experience_id=${room.forumId}&first=50`);
        for (const post of res.data ?? []) add(post.user);
      } catch (e) {
        console.error(`Could not read the ${slug} room's posts: ${e instanceof Error ? e.message : e}`);
      }
    }
    if (people.size) await ctx.runMutation(internal.invites.saveDirectory, { people: [...people.values()] });
    return null;
  },
});

export const saveDirectory = internalMutation({
  args: { people: v.array(v.object({ whopUserId: v.string(), username: v.string(), name: v.string(), avatarUrl: v.optional(v.string()) })) },
  handler: async (ctx, { people }) => {
    const now = Date.now();
    for (const p of people) {
      const has = await ctx.db.query("whopPeople").withIndex("by_whopUserId", (q) => q.eq("whopUserId", p.whopUserId)).unique();
      if (!has) await ctx.db.insert("whopPeople", { ...p, at: now });
      else if (has.username !== p.username || has.name !== p.name || (p.avatarUrl && has.avatarUrl !== p.avatarUrl)) await ctx.db.patch("whopPeople", has._id, { ...p, at: now });
    }
    return null;
  },
});
