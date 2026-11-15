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
  handler: async (ctx, { deviceId }): Promise<{ rules: Rule[]; products: { barcode: string; facts: string }[]; fronts: { barcode: string; brand?: string; name: string }[] }> => {
    const rows = await ctx.db.query("rules").withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId)).take(500);
    const rules: Rule[] = rows.map(({ _id, _creationTime, deviceId: _d, custom: _c, ...rule }) => rule);
    const known = await ctx.db.query("productCache").order("desc").take(300);
    const seen = new Set<string>();
    const products = known.filter((p) => !seen.has(p.barcode) && seen.add(p.barcode)).map((p) => ({ barcode: p.barcode, facts: p.facts }));
    const names = await ctx.db.query("shelfNames").order("desc").take(300);
    const fronts = names.map((n) => ({ barcode: n.barcode, name: n.name, ...(n.brand ? { brand: n.brand } : {}) }));
    return { rules, products, fronts };
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

/** Remember how a product's front reads, so the shelf view recognises it by those words from now on. */
export const nameFront = internalMutation({
  args: { barcode: v.string(), brand: v.optional(v.string()), name: v.string() },
  handler: async (ctx, { barcode, brand, name }): Promise<null> => {
    const have = await ctx.db.query("shelfNames").withIndex("by_barcode", (q) => q.eq("barcode", barcode)).take(10);
    if (have.some((h) => h.name === name && h.brand === brand)) return null;
    await ctx.db.insert("shelfNames", { barcode, name, ...(brand ? { brand } : {}), at: Date.now() });
    return null;
  },
});
