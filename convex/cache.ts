// Two caches that save repeating work a scan has already paid for. Both hold only what does not depend on who is
// scanning: nothing here is keyed by, or contains, a profile or a device.
//
// - tagCache: the parsed answer to one exact model request (tagging a set of dishes, or the per-tag second pass
//   over a menu). The key is a hash of the model, the instructions and the text sent, so a hit means the very same
//   question was asked before. A different menu, a reworded dish, another model or an edited prompt is a new key.
// - productCache: what the food database said about a barcode.
//
// Entries carry the time they were stored. Queries may not read the clock, so the caller decides what is too old.

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const getAnswers = internalQuery({
  args: { keys: v.array(v.string()) },
  handler: async (ctx, { keys }): Promise<{ key: string; value: string; at: number }[]> => {
    const out: { key: string; value: string; at: number }[] = [];
    for (const key of [...new Set(keys)].slice(0, 200)) {
      // Newest first: a refreshed entry is written before the stale one is removed.
      const row = await ctx.db.query("tagCache").withIndex("by_key", (q) => q.eq("key", key)).order("desc").first();
      if (row) out.push({ key, value: row.value, at: row.at });
    }
    return out;
  },
});

export const putAnswers = internalMutation({
  args: { entries: v.array(v.object({ key: v.string(), step: v.string(), value: v.string() })) },
  handler: async (ctx, { entries }): Promise<null> => {
    const at = Date.now();
    for (const e of entries.slice(0, 200)) {
      const old = await ctx.db.query("tagCache").withIndex("by_key", (q) => q.eq("key", e.key)).take(20);
      await ctx.db.insert("tagCache", { ...e, at });
      for (const row of old) await ctx.db.delete("tagCache", row._id);
    }
    return null;
  },
});

export const getProduct = internalQuery({
  args: { barcode: v.string() },
  handler: async (ctx, { barcode }): Promise<{ facts: string; at: number } | null> => {
    const row = await ctx.db.query("productCache").withIndex("by_barcode", (q) => q.eq("barcode", barcode)).order("desc").first();
    return row ? { facts: row.facts, at: row.at } : null;
  },
});

export const putProduct = internalMutation({
  args: { barcode: v.string(), facts: v.string() },
  handler: async (ctx, { barcode, facts }): Promise<null> => {
    const old = await ctx.db.query("productCache").withIndex("by_barcode", (q) => q.eq("barcode", barcode)).take(20);
    await ctx.db.insert("productCache", { barcode, facts, at: Date.now() });
    for (const row of old) await ctx.db.delete("productCache", row._id);
    return null;
  },
});
