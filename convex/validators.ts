// Convex validators mirroring engine/types.ts. If a shape changes there, change it here in the same commit.
import { v } from "convex/values";

export const sureness = v.union(v.literal("certain"), v.literal("likely"), v.literal("unsure"));
export const origin = v.union(
  v.literal("label"), v.literal("database"), v.literal("restaurant"), v.literal("menu_text"), v.literal("inferred"), v.literal("user"),
);
const level3 = v.union(v.literal("low"), v.literal("medium"), v.literal("high"));

export const itemTag = v.object({
  tag: v.string(),
  sureness,
  origin,
  evidence: v.optional(v.string()),
  p: v.optional(v.number()),
});

export const nutrients = v.object({
  per: v.union(v.literal("serving"), v.literal("100g")),
  sodiumMg: v.optional(v.number()),
  potassiumMg: v.optional(v.number()),
  sugarG: v.optional(v.number()),
  addedSugarG: v.optional(v.number()),
  satFatG: v.optional(v.number()),
  carbsG: v.optional(v.number()),
  proteinG: v.optional(v.number()),
  fiberG: v.optional(v.number()),
  kcal: v.optional(v.number()),
});

export const box = v.object({ top: v.number(), left: v.number(), bottom: v.number(), right: v.number() });

export const item = v.object({
  id: v.string(),
  kind: v.union(v.literal("dish"), v.literal("product"), v.literal("supplement"), v.literal("otc")),
  name: v.string(),
  description: v.optional(v.string()),
  ingredients: v.array(v.object({ name: v.string(), origin, evidence: v.optional(v.string()) })),
  tags: v.array(itemTag),
  nutrients: v.optional(nutrients),
  levels: v.optional(v.record(v.string(), level3)),
  position: v.optional(v.array(box)),
  incomplete: v.optional(v.boolean()),
});

export const ruleLevel = v.union(v.literal("never"), v.literal("avoid"), v.literal("limit"), v.literal("keep_steady"));

/** A Rule as engine/types.ts defines it. Stored rows add deviceId. */
export const ruleFields = {
  id: v.string(),
  level: ruleLevel,
  tag: v.string(),
  budget: v.optional(v.object({ nutrient: v.string(), amount: v.number(), unit: v.string(), per: v.literal("day") })),
  reason: v.string(),
  source: v.object({ title: v.string(), url: v.string(), quote: v.optional(v.string()) }),
  from: v.object({
    type: v.union(v.literal("allergy"), v.literal("medication"), v.literal("condition"), v.literal("diet"), v.literal("user")),
    label: v.string(),
  }),
  status: v.union(v.literal("library"), v.literal("sourced"), v.literal("from_label"), v.literal("unverified")),
  enabled: v.boolean(),
};
export const rule = v.object(ruleFields);

export const hardCheck = v.object({
  itemId: v.string(),
  ruleId: v.string(),
  code: v.union(v.literal("match"), v.literal("hides_in"), v.literal("no_match")),
  judgeP: v.union(v.number(), v.null()),
  reader: v.union(v.literal("yes"), v.literal("maybe"), v.literal("no"), v.null()),
  answer: v.optional(
    v.object({
      value: v.union(v.literal("yes"), v.literal("no")),
      by: v.union(v.literal("this_user"), v.literal("another_user")),
      at: v.string(),
    }),
  ),
});

export const finding = v.object({
  ruleId: v.optional(v.string()),
  outcome: v.union(v.literal("blocked"), v.literal("ask"), v.literal("note"), v.literal("confirm")),
  because: v.string(),
  question: v.optional(v.string()),
  unsourced: v.optional(v.boolean()),
  source: v.optional(v.object({ title: v.string(), quote: v.string() })),
  about: v.optional(v.string()),
});

export const verdict = v.object({
  fit: v.union(v.literal("good"), v.literal("okay"), v.literal("not_fit"), v.literal("cant_tell")),
  score: v.optional(v.number()),
  findings: v.array(finding),
});

export const rankedItem = v.object({
  itemId: v.string(),
  section: v.union(v.literal("best"), v.literal("okay"), v.literal("not_fit"), v.literal("cant_tell")),
  line: v.string(),
  modification: v.optional(v.string()),
});

export const answerValue = v.union(v.literal("yes"), v.literal("no"), v.literal("skipped"));

export const scanQuestion = v.object({
  id: v.string(),
  itemId: v.string(),
  ruleId: v.string(),
  text: v.string(),
  answer: v.optional(answerValue),
});

export const scanStatus = v.union(
  v.literal("reading"), v.literal("judging"), v.literal("ranking"), v.literal("explaining"), v.literal("done"), v.literal("failed"),
);
export const scanKind = v.union(v.literal("menu"), v.literal("product"), v.literal("label"), v.literal("unknown"));

export const location = v.object({ lat: v.number(), lng: v.number() });
/** A line of text the phone recognised on the photo, with where it is (fractions of the photo). */
export const textLine = v.object({ text: v.string(), box });

/** A line of the photo flagged early, from the recognised text alone (engine/pipeline.ts earlyHints). */
export const earlyHint = v.object({ box, fit: v.union(v.literal("not_fit"), v.literal("cant_tell")) });

export const medicationStatus = v.object({
  name: v.string(),
  state: v.union(v.literal("pending"), v.literal("rules"), v.literal("no_rules"), v.literal("not_recognised"), v.literal("no_label"), v.literal("failed")),
});

export const profile = v.object({
  medications: v.array(v.object({ name: v.string(), rxcui: v.optional(v.string()) })),
  conditions: v.array(v.object({ name: v.string(), key: v.optional(v.string()) })),
  allergies: v.array(v.string()),
  diets: v.array(v.string()),
});
