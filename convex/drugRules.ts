import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { medicationStatus, ruleFields } from "./validators";
import { LABEL_RULES_VERSION } from "../engine/labelRules";
import type { Profile, Rule } from "../engine/types";

export const profileFor = internalQuery({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }): Promise<Profile | null> => {
    const row = await ctx.db.query("profiles").withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId)).unique();
    return row?.profile ?? null;
  },
});

export const cached = internalQuery({
  args: { rxcui: v.string() },
  handler: async (ctx, { rxcui }) => {
    const row = await ctx.db.query("drugRules").withIndex("by_rxcui", (q) => q.eq("rxcui", rxcui)).first();
    // A reading made by an older version of the label reader is treated as missing, so it is redone.
    if (!row || row.version !== LABEL_RULES_VERSION) return null;
    return { outcome: row.outcome, drugName: row.drugName, rules: row.rules as Rule[] };
  },
});

export const store = internalMutation({
  args: {
    rxcui: v.string(),
    drugName: v.string(),
    setId: v.optional(v.string()),
    outcome: v.union(v.literal("rules"), v.literal("no_food_rules"), v.literal("no_label")),
    rules: v.array(v.object(ruleFields)),
  },
  handler: async (ctx, args) => {
    const old = await ctx.db.query("drugRules").withIndex("by_rxcui", (q) => q.eq("rxcui", args.rxcui)).take(10);
    for (const r of old) await ctx.db.delete("drugRules", r._id);
    await ctx.db.insert("drugRules", { ...args, readAt: Date.now(), version: LABEL_RULES_VERSION });
    return null;
  },
});

/** Is any medication's label still being read for this device? */
export const pending = internalQuery({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }): Promise<boolean> => {
    const row = await ctx.db.query("profiles").withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId)).unique();
    return !!row?.medStatus?.some((m) => m.state === "pending");
  },
});

/**
 * Write the outcome of reading the device's medication labels.
 * - A medication whose reading FAILED keeps whatever rules it already had; a failure must not erase rules.
 * - Rules the user switched off stay off, and a tag the user has their own rule on is left to them.
 * - If the profile changed while labels were being read, only medications still in it are written.
 */
export const setForDevice = internalMutation({
  args: {
    deviceId: v.string(),
    results: v.array(v.object({ name: v.string(), state: medicationStatus.fields.state, rules: v.array(v.object(ruleFields)) })),
  },
  handler: async (ctx, { deviceId, results }) => {
    const profile = await ctx.db.query("profiles").withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId)).unique();
    if (!profile) return null;
    const taking = new Set(profile.profile.medications.map((m) => m.name.trim().toLowerCase()));
    const failed = new Set(results.filter((r) => r.state === "failed").map((r) => r.name.toLowerCase()));
    const old = await ctx.db.query("rules").withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId)).take(500);
    const switchedOff = new Set(old.filter((r) => !r.enabled).map((r) => r.id));
    const customTags = new Set(old.filter((r) => r.custom).map((r) => r.tag));
    for (const r of old) {
      if (r.custom || r.from.type !== "medication") continue;
      if (failed.has(r.from.label.toLowerCase()) && taking.has(r.from.label.toLowerCase())) continue; // keep what we had
      await ctx.db.delete("rules", r._id);
    }
    const seen = new Set<string>();
    for (const result of results) {
      if (result.state === "failed") continue;
      for (const r of result.rules) {
        if (!taking.has(r.from.label.toLowerCase()) || customTags.has(r.tag) || seen.has(r.id)) continue;
        seen.add(r.id);
        await ctx.db.insert("rules", { deviceId, custom: false, ...r, enabled: !switchedOff.has(r.id) });
      }
    }
    const state = new Map(results.map((r) => [r.name.toLowerCase(), r.state]));
    await ctx.db.patch("profiles", profile._id, {
      medStatus: profile.profile.medications
        .map((m) => m.name.trim())
        .filter(Boolean)
        .map((name) => ({ name, state: state.get(name.toLowerCase()) ?? ("pending" as const) })),
    });
    return null;
  },
});
