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

  // ── Together: communities and group challenges. Identity is a Whop account, verified with Whop on sign-in. ──

  // A person signed in with Whop, linked to the device whose profile places them in rooms.
  members: defineTable({
    whopUserId: v.string(),
    username: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
    deviceId: v.string(),
    // null/absent until they answer the placement question; true places them in their condition rooms.
    autoPlace: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_whopUserId", ["whopUserId"])
    .index("by_deviceId", ["deviceId"]),

  // A sign-in session. Only a SHA-256 of the token the phone holds is stored.
  sessions: defineTable({ tokenHash: v.string(), memberId: v.id("members") }).index("by_tokenHash", ["tokenHash"]),

  // Member count per room (rooms themselves are data/communities.json).
  rooms: defineTable({ slug: v.string(), memberCount: v.number() }).index("by_slug", ["slug"]),

  roomMembers: defineTable({
    room: v.string(),
    memberId: v.id("members"),
    source: v.union(v.literal("auto"), v.literal("manual")),
    joinedAt: v.number(),
  })
    .index("by_memberId", ["memberId"])
    .index("by_room_and_memberId", ["room", "memberId"]),

  // Last time a signed-in member's app was open, for "online now". High-churn, so kept apart from members.
  presence: defineTable({ memberId: v.id("members"), lastSeenAt: v.number() }).index("by_memberId", ["memberId"]),

  // A room someone left; automatic placement never re-adds it.
  roomOptOuts: defineTable({ memberId: v.id("members"), room: v.string() }).index("by_memberId_and_room", ["memberId", "room"]),

  // A challenge between friends (the points race, engine/challenge.ts). Joined by invite link.
  challenges: defineTable({
    days: v.number(),
    startsAt: v.number(),
    tzOffsetMinutes: v.number(),
    createdBy: v.id("members"),
    // Players who are in: everyone in a free race, only those whose payment arrived in a money race.
    playerCount: v.number(),
    // What each player pays to enter, in cents; 0 is a free race. The winner takes the pool (convex/pay.ts).
    entryCents: v.number(),
    // Money races only: when the pool was settled, and how. Written once; the standings it was settled on are
    // whatever the scans showed at that moment.
    settledAt: v.optional(v.number()),
    settlement: v.optional(v.object({ refundAll: v.boolean(), potCents: v.number(), feeCents: v.number(), prizeCents: v.number() })),
  }),

  // One player in one challenge. In a money race an entry is "pending" from checkout until Whop confirms the
  // payment; only "paid" entries race. Free entries have no status.
  entries: defineTable({
    challengeId: v.id("challenges"),
    memberId: v.id("members"),
    joinedAt: v.number(),
    status: v.optional(v.union(v.literal("pending"), v.literal("paid"))),
    // The Whop payment for this entry, what the player paid and what reached us after Whop's fee, in cents.
    paymentId: v.optional(v.string()),
    grossCents: v.optional(v.number()),
    netCents: v.optional(v.number()),
  })
    .index("by_challengeId_and_memberId", ["challengeId", "memberId"])
    .index("by_memberId", ["memberId"]),

  // Money owed to a player: a prize (a Whop transfer to their account) or a refund of their entry payment.
  // `key` makes each one unique ("prize:<challenge>:<member>", "refund:<payment>"), so nothing is paid twice.
  payouts: defineTable({
    key: v.string(),
    challengeId: v.id("challenges"),
    memberId: v.id("members"),
    kind: v.union(v.literal("prize"), v.literal("refund")),
    cents: v.number(),
    paymentId: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("sent"), v.literal("failed")),
    attempts: v.number(),
    // Whop's id for the transfer or refunded payment, and its last error if sending failed.
    whopId: v.optional(v.string()),
    error: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_challengeId_and_memberId", ["challengeId", "memberId"]),

  // "I ordered this": the dish a person picked from one of their scans. Its fit is read from the scan when scoring,
  // never stored here, so it always matches what the scan shows.
  meals: defineTable({ deviceId: v.string(), scanId: v.id("scans"), itemId: v.string(), dishName: v.string(), at: v.number() })
    .index("by_deviceId_and_at", ["deviceId", "at"])
    .index("by_scanId", ["scanId"]),

  // What a product's FRONT says, as the photo reader read it off a shelf ("Campbell's Country Ladle Chicken &
  // Pasta"), kept beside the database's own name for it, which is often worded differently. The shelf view matches
  // package fronts against both.
  shelfNames: defineTable({ barcode: v.string(), brand: v.optional(v.string()), name: v.string(), at: v.number() }).index("by_barcode", ["barcode"]),

  // Background jobs the shelf view has started (reading a product's ingredients, looking up an unknown package),
  // so the same one is not started again on every camera frame. See convex/shelfData.ts.
  shelfClaims: defineTable({ key: v.string(), at: v.number() }).index("by_key", ["key"]),

  // The compiled and custom rules for a device.
  rules: defineTable({ deviceId: v.string(), custom: v.boolean(), ...ruleFields })
    .index("by_deviceId", ["deviceId"])
    .index("by_deviceId_and_id", ["deviceId", "id"]),
});
