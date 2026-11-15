import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";

/**
 * Sign-in for Together. The phone signs in with Whop (OAuth + PKCE) and hands us the access token once; we ask Whop
 * who it belongs to, so nobody can claim to be someone else. We keep only who they are and a hashed session token.
 */

const WHOP_API = "https://api.whop.com";

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The signed-in member for a session token, or null. */
export async function memberFor(ctx: QueryCtx | MutationCtx, session: string): Promise<Doc<"members"> | null> {
  if (!session) return null;
  const hash = await sha256(session);
  const s = await ctx.db.query("sessions").withIndex("by_tokenHash", (q) => q.eq("tokenHash", hash)).unique();
  return s ? await ctx.db.get("members", s.memberId) : null;
}

export async function requireMember(ctx: QueryCtx | MutationCtx, session: string): Promise<Doc<"members">> {
  const m = await memberFor(ctx, session);
  if (!m) throw new Error("Not signed in");
  return m;
}

export const signIn = action({
  args: { deviceId: v.string(), accessToken: v.string() },
  handler: async (ctx, { deviceId, accessToken }): Promise<{ session: string }> => {
    const res = await fetch(`${WHOP_API}/oauth/userinfo`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error("Whop did not recognise this sign-in");
    const me = (await res.json()) as { sub?: string; preferred_username?: string; name?: string; picture?: string };
    if (!me.sub) throw new Error("Whop did not say who this is");
    const session = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
    await ctx.runMutation(internal.members.upsert, {
      deviceId,
      whopUserId: me.sub,
      username: me.preferred_username ?? me.sub,
      name: me.name || me.preferred_username || "Member",
      avatarUrl: me.picture || undefined,
      tokenHash: await sha256(session),
    });
    return { session };
  },
});

export const upsert = internalMutation({
  args: {
    deviceId: v.string(),
    whopUserId: v.string(),
    username: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
    tokenHash: v.string(),
  },
  handler: async (ctx, { tokenHash, ...who }) => {
    const existing = await ctx.db.query("members").withIndex("by_whopUserId", (q) => q.eq("whopUserId", who.whopUserId)).unique();
    let memberId: Id<"members">;
    if (existing) {
      await ctx.db.patch("members", existing._id, who);
      memberId = existing._id;
    } else {
      memberId = await ctx.db.insert("members", { ...who, createdAt: Date.now() });
    }
    await ctx.db.insert("sessions", { tokenHash, memberId });
    return null;
  },
});

export const me = query({
  args: { session: v.string() },
  handler: async (ctx, { session }) => {
    const m = await memberFor(ctx, session);
    return m ? { id: m._id, username: m.username, name: m.name, avatarUrl: m.avatarUrl ?? null, autoPlace: m.autoPlace ?? null } : null;
  },
});

export const signOut = mutation({
  args: { session: v.string() },
  handler: async (ctx, { session }) => {
    const hash = await sha256(session);
    const s = await ctx.db.query("sessions").withIndex("by_tokenHash", (q) => q.eq("tokenHash", hash)).unique();
    if (s) await ctx.db.delete("sessions", s._id);
    return null;
  },
});
