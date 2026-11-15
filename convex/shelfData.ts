// Data the shelf view needs, read and written outside the Node runtime (convex/shelf.ts holds the actions).

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Rule } from "../engine/types";

/**
 * A person's rules, and the products the app already knows by barcode (anything anyone has scanned, or that the
 * shelf view has looked up). Newest first, bounded: the shelf view matches package fronts against these names.
 */
export const context = internalQuery({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }): Promise<{ rules: Rule[]; products: { barcode: string; facts: string }[] }> => {
    const rows = await ctx.db.query("rules").withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId)).take(500);
    const rules: Rule[] = rows.map(({ _id, _creationTime, deviceId: _d, custom: _c, ...rule }) => rule);
    const known = await ctx.db.query("productCache").order("desc").take(300);
    const seen = new Set<string>();
    const products = known.filter((p) => !seen.has(p.barcode) && seen.add(p.barcode)).map((p) => ({ barcode: p.barcode, facts: p.facts }));
    return { rules, products };
  },
});

/**
 * Take a turn at some background job, so the same job is not started once a second while the camera looks at the
 * same shelf. True if nobody has claimed `key` within `ttlMs`; the claim is then this caller's.
 */
export const claim = internalMutation({
  args: { key: v.string(), ttlMs: v.number() },
  handler: async (ctx, { key, ttlMs }): Promise<boolean> => {
    const now = Date.now();
    const held = await ctx.db.query("shelfClaims").withIndex("by_key", (q) => q.eq("key", key)).take(5);
    if (held.some((h) => now - h.at < ttlMs)) return false;
    for (const h of held) await ctx.db.delete("shelfClaims", h._id);
    await ctx.db.insert("shelfClaims", { key, at: now });
    return true;
  },
});
