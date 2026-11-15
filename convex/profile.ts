import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { compileRules, dedupeByTag } from "../engine/compileRules";
import { packRules } from "../engine/packs";
import { profile as profileValidator } from "./validators";
import { syncRoomsForDevice } from "./together";
import type { MedicationStatus, Profile } from "../engine/types";

const EMPTY: Profile = { medications: [], conditions: [], allergies: [], diets: [] };

/** The device's profile, or an empty one if it has not been set up. */
export const get = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }): Promise<Profile> => {
    const row = await ctx.db.query("profiles").withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId)).unique();
    return row?.profile ?? EMPTY;
  },
});

/**
 * Save the profile and recompile its rules.
 * - Allergy and diet rules are compiled here, at once.
 * - Medication rules are read from each drug's FDA label by a background step and appear in `rules.list` a few
 *   seconds later. Rules already read for a medication that is still in the profile are kept meanwhile.
 * - Rules the user added themselves are kept, and a rule the user switched off stays off.
 */
export const save = mutation({
  args: { deviceId: v.string(), profile: profileValidator },
  handler: async (ctx, { deviceId, profile }) => {
    const existing = await ctx.db.query("profiles").withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId)).unique();
    if (existing) await ctx.db.patch("profiles", existing._id, { profile });
    else await ctx.db.insert("profiles", { deviceId, profile });
    await recompileRules(ctx, deviceId, profile);
    // Rooms follow conditions: placed in a new condition's room, out of a removed one's (if the person opted in).
    await syncRoomsForDevice(ctx, deviceId);
    return null;
  },
});

/** Rebuild a device's compiled rules from its profile. Also used when a custom rule is removed, so that a compiled rule it was hiding comes back. */
export async function recompileRules(ctx: MutationCtx, deviceId: string, profile: Profile): Promise<void> {
  const old = await ctx.db.query("rules").withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId)).take(500);
  const switchedOff = new Set(old.filter((r) => !r.custom && !r.enabled).map((r) => r.id));
  const stillTaking = new Set(profile.medications.map((m) => m.name.trim().toLowerCase()));
  for (const r of old) {
    if (r.custom) continue;
    if (r.from.type === "medication" && stillTaking.has(r.from.label.toLowerCase())) continue;
    await ctx.db.delete("rules", r._id);
  }
  const customTags = new Set(old.filter((r) => r.custom).map((r) => r.tag));
  // Rule packs this device has paid for (convex/packs.ts) are compiled in beside the profile's own rules. On a
  // shared tag the stronger rule stays, and at the same level the profile's.
  const packs = await ctx.db.query("packPurchases").withIndex("by_deviceId_and_packId", (q) => q.eq("deviceId", deviceId)).take(50);
  const owned = packs.filter((p) => p.status === "paid").map((p) => p.packId);
  for (const r of dedupeByTag([...compileRules(profile), ...packRules(owned)])) {
    if (customTags.has(r.tag)) continue; // the user's own rule on this tag wins
    await ctx.db.insert("rules", { deviceId, custom: false, ...r, enabled: !switchedOff.has(r.id) });
  }
  // Every medication is "pending" until its label has been read. Scans started meanwhile wait for this.
  const row = await ctx.db.query("profiles").withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId)).unique();
  const meds = profile.medications.map((m) => m.name.trim()).filter(Boolean);
  if (row) await ctx.db.patch("profiles", row._id, { medStatus: meds.map((name) => ({ name, state: "pending" as const })) });
  if (meds.length) await ctx.scheduler.runAfter(0, internal.medications.compile, { deviceId });
}

/**
 * Where each medication's label reading has got to, for the setup and Your rules screens: still being read, read
 * with rules, read with nothing about food or supplements, name not recognised, no FDA label found, or failed.
 */
export const medications = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }): Promise<(MedicationStatus & { ruleCount: number })[]> => {
    const row = await ctx.db.query("profiles").withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId)).unique();
    if (!row) return [];
    const rules = await ctx.db.query("rules").withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId)).take(500);
    const status = new Map((row.medStatus ?? []).map((m) => [m.name.toLowerCase(), m.state]));
    return row.profile.medications
      .map((m) => m.name.trim())
      .filter(Boolean)
      .map((name) => ({
        name,
        state: status.get(name.toLowerCase()) ?? ("pending" as const),
        ruleCount: rules.filter((r) => r.from.type === "medication" && r.from.label.toLowerCase() === name.toLowerCase()).length,
      }));
  },
});
