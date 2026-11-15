import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { conditionNotes, type ConditionNote } from "../engine/compileRules";
import { isKnownTag, tagLabel } from "../engine/tags";
import { recompileRules } from "./profile";
import { ruleLevel } from "./validators";
import type { Rule } from "../engine/types";

/** The device's rules for the Your rules screen, strongest level first. */
export const list = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }): Promise<(Rule & { custom: boolean })[]> => {
    const rows = await ctx.db.query("rules").withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId)).take(500);
    const order = { never: 0, avoid: 1, limit: 2, keep_steady: 3 } as const;
    return rows
      .map(({ _id, _creationTime, deviceId: _d, ...rule }) => rule)
      .sort((a, b) => order[a.level] - order[b.level] || a.tag.localeCompare(b.tag));
  },
});

/** Switch a rule on or off, or change its level. */
export const update = mutation({
  args: { deviceId: v.string(), ruleId: v.string(), enabled: v.optional(v.boolean()), level: v.optional(ruleLevel) },
  handler: async (ctx, { deviceId, ruleId, enabled, level }) => {
    const row = await ctx.db
      .query("rules")
      .withIndex("by_deviceId_and_id", (q) => q.eq("deviceId", deviceId).eq("id", ruleId))
      .unique();
    if (!row) throw new Error("Rule not found");
    await ctx.db.patch("rules", row._id, {
      ...(enabled === undefined ? {} : { enabled }),
      ...(level === undefined ? {} : { level }),
    });
    return null;
  },
});

/** Add the user's own rule. It replaces any existing rule on the same tag. */
export const addCustom = mutation({
  args: {
    deviceId: v.string(),
    tag: v.string(),
    level: ruleLevel,
    reason: v.optional(v.string()),
    budget: v.optional(v.object({ nutrient: v.string(), amount: v.number(), unit: v.string(), per: v.literal("day") })),
  },
  handler: async (ctx, { deviceId, tag, level, reason, budget }) => {
    if (!isKnownTag(tag)) throw new Error(`Unknown tag: ${tag}`);
    const existing = await ctx.db.query("rules").withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId)).take(500);
    for (const r of existing) if (r.tag === tag) await ctx.db.delete("rules", r._id);
    const id = `custom:${tag}`;
    await ctx.db.insert("rules", {
      deviceId,
      custom: true,
      id,
      level,
      tag,
      ...(budget ? { budget } : {}),
      reason: reason?.trim() || `You added a rule about ${tagLabel(tag)}.`,
      source: { title: "Your own rule", url: "app://profile" },
      from: { type: "user", label: "your own rule" },
      status: "library",
      enabled: true,
    });
    return id;
  },
});

/** Remove a rule the user added. Compiled rules are switched off with `update`, not removed. */
export const removeCustom = mutation({
  args: { deviceId: v.string(), ruleId: v.string() },
  handler: async (ctx, { deviceId, ruleId }) => {
    const row = await ctx.db
      .query("rules")
      .withIndex("by_deviceId_and_id", (q) => q.eq("deviceId", deviceId).eq("id", ruleId))
      .unique();
    if (!row?.custom) return null;
    await ctx.db.delete("rules", row._id);
    // A compiled rule on the same tag may have been hidden by this one: bring it back.
    const profile = await ctx.db.query("profiles").withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId)).unique();
    if (profile) await recompileRules(ctx, deviceId, profile.profile);
    return null;
  },
});

/** For conditions in the profile that produced no rules: why (the source says there are none, or we have not covered it). */
export const notes = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }): Promise<ConditionNote[]> => {
    const row = await ctx.db.query("profiles").withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId)).unique();
    return row ? conditionNotes(row.profile) : [];
  },
});
