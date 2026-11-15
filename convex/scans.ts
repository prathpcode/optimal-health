import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { dishKey, restaurantId as makeRestaurantId, type RememberedAnswer } from "../engine/memory";
import { afterAnswer, afterRestaurant, answersToRemember } from "../engine/pipeline";
import type { Rule, ScanRecord } from "../engine/types";
import { answerValue, earlyHint, hardCheck, item, location, rankedItem, scanKind, scanQuestion, scanStatus, textLine, verdict } from "./validators";

/** A one-time URL the app uploads a photo to. The upload's response contains the storage id to pass to `start`. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx): Promise<string> => await ctx.storage.generateUploadUrl(),
});

/**
 * Create a scan from a photo, a barcode, or both, and start the pipeline. Returns the scan id to subscribe to.
 * Optional extras: `location` lets answers be remembered for this restaurant; `lines` (text the phone recognised on
 * the photo, with positions) lets each dish be outlined on the photo.
 */
export const start = mutation({
  args: {
    deviceId: v.string(),
    imageId: v.optional(v.id("_storage")),
    barcode: v.optional(v.string()),
    location: v.optional(location),
    lines: v.optional(v.array(textLine)),
  },
  handler: async (ctx, { deviceId, imageId, barcode, location: where, lines }) => {
    if (!imageId && !barcode) throw new Error("A scan needs a photo or a barcode");
    const rows = await ctx.db.query("rules").withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId)).take(500);
    const rulesUsed: Rule[] = rows.map(({ _id, _creationTime, deviceId: _d, custom: _c, ...rule }) => rule);
    const scanId = await ctx.db.insert("scans", {
      deviceId,
      status: "reading",
      kind: "unknown",
      imageIds: imageId ? [imageId] : [],
      ...(barcode ? { barcode } : {}),
      ...(where ? { location: where } : {}),
      ...(lines?.length ? { lines: lines.slice(0, 600) } : {}),
      items: [],
      checks: [],
      verdicts: {},
      ranking: [],
      questions: [],
      explanations: {},
      generic: !rulesUsed.some((r) => r.enabled),
      rulesUsed,
    });
    await ctx.scheduler.runAfter(0, internal.pipeline.run, { scanId });
    return scanId;
  },
});

function toRecord(row: Doc<"scans">): ScanRecord {
  return {
    status: row.status,
    kind: row.kind,
    imageId: row.imageIds[0] ?? "",
    items: row.items,
    checks: row.checks,
    verdicts: row.verdicts,
    ranking: row.ranking,
    questions: row.questions,
    explanations: row.explanations,
    generic: row.generic,
    ...(row.provisional ? { provisional: true } : {}),
    ...(row.summary ? { summary: row.summary } : {}),
    ...(row.restaurantName ? { restaurantName: row.restaurantName } : {}),
    ...(row.restaurantId ? { restaurantId: row.restaurantId } : {}),
    // Only until the dishes have positions of their own: after that the app outlines dishes, not raw text.
    ...(row.lines?.length && !row.items.some((i) => i.position?.length) && row.status !== "failed" ? { textBoxes: row.lines.slice(0, 300).map((l) => l.box) } : {}),
    ...(row.hints?.length && !row.items.some((i) => i.position?.length) && row.status !== "failed" ? { earlyHints: row.hints } : {}),
    ...(row.notice ? { notice: row.notice } : {}),
    ...(row.error ? { error: row.error } : {}),
  };
}

/** The live ScanRecord. Subscribe to this and draw whatever is there; it fills in as the pipeline runs. */
export const get = query({
  args: { scanId: v.id("scans") },
  handler: async (ctx, { scanId }): Promise<ScanRecord | null> => {
    const row = await ctx.db.get("scans", scanId);
    return row ? toRecord(row) : null;
  },
});

/** Recent scans for the history list, newest first. */
export const list = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const rows = await ctx.db.query("scans").withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId)).order("desc").take(30);
    return rows.map((r) => ({
      scanId: r._id,
      createdAt: r._creationTime,
      status: r.status,
      kind: r.kind,
      title: r.restaurantName ?? r.items[0]?.name ?? "Scan",
      itemCount: r.items.length,
    }));
  },
});

/** Record the answer to an "ask your server" question. The verdicts, ranking and questions update at once. */
export const answer = mutation({
  args: { scanId: v.id("scans"), questionId: v.string(), value: answerValue },
  handler: async (ctx, { scanId, questionId, value }) => {
    const row = await ctx.db.get("scans", scanId);
    if (!row) throw new Error("Scan not found");
    // One timestamp for the scan's own record and the remembered copy, so the two can be matched up later.
    const at = new Date().toISOString();
    const next = afterAnswer(row, row.rulesUsed, questionId, value, at);
    if (!next) throw new Error("Question not found");
    await ctx.db.patch("scans", scanId, next);
    // Remember what the restaurant said, so the next scan of this menu starts from it.
    const question = row.questions.find((q) => q.id === questionId);
    const dish = row.items.find((i) => i.id === question?.itemId);
    const rule = row.rulesUsed.find((r) => r.id === question?.ruleId);
    if (row.restaurantId && dish && rule && value !== "skipped") {
      await ctx.db.insert("answers", { restaurantId: row.restaurantId, dishKey: dishKey(dish), tag: rule.tag, value, deviceId: row.deviceId, at });
    }
    return null;
  },
});

// ---- Used by the pipeline only ----

export const load = internalQuery({
  args: { scanId: v.id("scans") },
  handler: async (ctx, { scanId }) => {
    const row = await ctx.db.get("scans", scanId);
    if (!row) return null;
    const imageUrls: string[] = [];
    for (const id of row.imageIds) {
      const url = await ctx.storage.getUrl(id);
      if (url) imageUrls.push(url);
    }
    const profile = await ctx.db.query("profiles").withIndex("by_deviceId", (q) => q.eq("deviceId", row.deviceId)).unique();
    return {
      barcode: row.barcode ?? null, rules: row.rulesUsed as Rule[], imageUrls, deviceId: row.deviceId, location: row.location ?? null, lines: row.lines ?? null,
      profile: profile?.profile ?? null,
    };
  },
});

export const patch = internalMutation({
  args: {
    scanId: v.id("scans"),
    status: v.optional(scanStatus),
    kind: v.optional(scanKind),
    items: v.optional(v.array(item)),
    checks: v.optional(v.array(hardCheck)),
    verdicts: v.optional(v.record(v.string(), verdict)),
    ranking: v.optional(v.array(rankedItem)),
    questions: v.optional(v.array(scanQuestion)),
    summary: v.optional(v.string()),
    explanations: v.optional(v.record(v.string(), v.string())),
    restaurantName: v.optional(v.string()),
    restaurantId: v.optional(v.string()),
    lines: v.optional(v.array(textLine)),
    hints: v.optional(v.array(earlyHint)),
    notice: v.optional(v.string()),
    provisional: v.optional(v.boolean()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { scanId, ...fields }) => {
    await ctx.db.patch("scans", scanId, fields);
    return null;
  },
});

export const forFollowup = internalQuery({
  args: { scanId: v.id("scans") },
  handler: async (ctx, { scanId }) => {
    const row = await ctx.db.get("scans", scanId);
    return row ? { items: row.items, verdicts: row.verdicts, rules: row.rulesUsed as Rule[] } : null;
  },
});

/** Answers remembered for a restaurant, newest first. */
export const remembered = internalQuery({
  args: { restaurantId: v.string() },
  handler: async (ctx, { restaurantId }): Promise<RememberedAnswer[]> => {
    const rows = await ctx.db.query("answers").withIndex("by_restaurantId", (q) => q.eq("restaurantId", restaurantId)).order("desc").take(500);
    return rows.map((r) => ({ dishKey: r.dishKey, tag: r.tag, value: r.value, deviceId: r.deviceId, at: r.at }));
  },
});

/** Add another photo (a second menu page) to a scan and read the whole thing again. */
export const addPage = mutation({
  args: { scanId: v.id("scans"), imageId: v.id("_storage") },
  handler: async (ctx, { scanId, imageId }) => {
    const row = await ctx.db.get("scans", scanId);
    if (!row) throw new Error("Scan not found");
    if (row.imageIds.length >= 6) throw new Error("A scan can hold at most six photos");
    await ctx.db.patch("scans", scanId, {
      imageIds: [...row.imageIds, imageId], status: "reading", provisional: false, items: [], checks: [], verdicts: {}, ranking: [], questions: [], explanations: {},
    });
    await ctx.scheduler.runAfter(0, internal.pipeline.run, { scanId });
    return null;
  },
});

/**
 * Confirm or correct which restaurant a scan is from, so that answers are remembered against the right place.
 * Returns the restaurant's id, or null when there is no location to tell it from another place of the same name.
 *
 * On a finished menu scan this also brings the scan in line with the restaurant it now belongs to: what that
 * restaurant has told people before is applied (as the pipeline would have done had it known), and answers already
 * given on this scan are stored against it, and taken back from the place the scan was wrongly matched to.
 */
export const setRestaurant = mutation({
  args: { scanId: v.id("scans"), name: v.string(), location: v.optional(location) },
  handler: async (ctx, { scanId, name, location: where }) => {
    const row = await ctx.db.get("scans", scanId);
    if (!row) throw new Error("Scan not found");
    const loc = where ?? row.location;
    const id = makeRestaurantId(name, loc);
    const named = { restaurantName: name.trim(), ...(loc ? { location: loc } : {}), ...(id ? { restaurantId: id } : {}) };
    // While the pipeline is still running it writes the verdicts itself, from the restaurant it was started with.
    if (!id || id === row.restaurantId || row.status !== "done" || row.kind !== "menu") {
      await ctx.db.patch("scans", scanId, named);
      return id;
    }
    const mine = answersToRemember(row, row.rulesUsed);
    if (row.restaurantId && mine.length) {
      const elsewhere = await ctx.db.query("answers").withIndex("by_restaurantId", (q) => q.eq("restaurantId", row.restaurantId!)).order("desc").take(500);
      for (const a of elsewhere) {
        // Matched on dish, allergen and answer, within a minute: older rows were stamped a moment after the scan's own record.
        const same = (m: (typeof mine)[number]) => m.dishKey === a.dishKey && m.tag === a.tag && m.value === a.value && Math.abs(Date.parse(m.at) - Date.parse(a.at)) < 60_000;
        if (a.deviceId === row.deviceId && mine.some(same)) await ctx.db.delete("answers", a._id);
      }
    }
    for (const a of mine) await ctx.db.insert("answers", { restaurantId: id, deviceId: row.deviceId, ...a });
    const rows = await ctx.db.query("answers").withIndex("by_restaurantId", (q) => q.eq("restaurantId", id)).order("desc").take(500);
    const remembered: RememberedAnswer[] = rows.map((r) => ({ dishKey: r.dishKey, tag: r.tag, value: r.value, deviceId: r.deviceId, at: r.at }));
    await ctx.db.patch("scans", scanId, { ...named, ...afterRestaurant(row, row.rulesUsed, remembered, row.deviceId, new Date()) });
    return id;
  },
});

/**
 * Take the device's rules as they are now and make them this scan's rules. Called by the pipeline after it has
 * waited for medication labels to be read, so a scan started straight after setup does not run without them.
 */
export const refreshRules = internalMutation({
  args: { scanId: v.id("scans") },
  handler: async (ctx, { scanId }): Promise<Rule[]> => {
    const row = await ctx.db.get("scans", scanId);
    if (!row) return [];
    const rows = await ctx.db.query("rules").withIndex("by_deviceId", (q) => q.eq("deviceId", row.deviceId)).take(500);
    const rulesUsed: Rule[] = rows.map(({ _id, _creationTime, deviceId: _d, custom: _c, ...rule }) => rule);
    await ctx.db.patch("scans", scanId, { rulesUsed, generic: !rulesUsed.some((r) => r.enabled) });
    return rulesUsed;
  },
});
