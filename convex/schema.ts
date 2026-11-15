import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { earlyHint, hardCheck, item, location, medicationStatus, profile, rankedItem, ruleFields, scanKind, scanQuestion, scanStatus, textLine, verdict } from "./validators";

export default defineSchema({
  // One row per scan. This is the ScanRecord the app draws; see engine/types.ts.
  scans: defineTable({
    deviceId: v.string(),
    status: scanStatus,
    kind: scanKind,
    imageIds: v.array(v.id("_storage")),
    barcode: v.optional(v.string()),
    items: v.array(item),
    checks: v.array(hardCheck),
    verdicts: v.record(v.string(), verdict),
    ranking: v.array(rankedItem),
    questions: v.array(scanQuestion),
    summary: v.optional(v.string()),
    explanations: v.record(v.string(), v.string()),
    generic: v.boolean(),
    provisional: v.optional(v.boolean()),
    restaurantName: v.optional(v.string()),
    restaurantId: v.optional(v.string()),
    location: v.optional(location),
    lines: v.optional(v.array(textLine)),
    hints: v.optional(v.array(earlyHint)),
    notice: v.optional(v.string()),
    error: v.optional(v.string()),
    // The rules in force when this scan ran, so answering a question re-evaluates against the same rules.
    rulesUsed: v.array(v.object(ruleFields)),
  }).index("by_deviceId", ["deviceId"]),

  // What a restaurant told someone about a dish. "yes" is shared with everyone; "no" counts only for its author.
  answers: defineTable({
    restaurantId: v.string(),
    dishKey: v.string(),
    tag: v.string(),
    value: v.union(v.literal("yes"), v.literal("no")),
    deviceId: v.string(),
    at: v.string(),
  }).index("by_restaurantId", ["restaurantId"]),

  // One row per device (stands in for an account until sign-in exists).
  profiles: defineTable({ deviceId: v.string(), profile, medStatus: v.optional(v.array(medicationStatus)) }).index("by_deviceId", ["deviceId"]),

  // Food rules read from a drug's FDA label, cached per ingredient so each label is read once.
  drugRules: defineTable({
    rxcui: v.string(),
    drugName: v.string(),
    setId: v.optional(v.string()),
    outcome: v.union(v.literal("rules"), v.literal("no_food_rules"), v.literal("no_label")),
    rules: v.array(v.object(ruleFields)),
    readAt: v.number(),
    version: v.optional(v.number()),
  }).index("by_rxcui", ["rxcui"]),

  // The parsed answer to one exact model request (dish tagging, or the per-tag second pass), keyed by a hash of the
  // model, instructions and text sent. Holds nothing about any person. See convex/cache.ts.
  tagCache: defineTable({ key: v.string(), step: v.string(), value: v.string(), at: v.number() }).index("by_key", ["key"]),

  // What the food database returned for a barcode (ProductFacts as JSON).
  productCache: defineTable({ barcode: v.string(), facts: v.string(), at: v.number() }).index("by_barcode", ["barcode"]),

  // The compiled and custom rules for a device.
  rules: defineTable({ deviceId: v.string(), custom: v.boolean(), ...ruleFields })
    .index("by_deviceId", ["deviceId"])
    .index("by_deviceId_and_id", ["deviceId", "id"]),
});
