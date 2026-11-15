"use node";

import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import { internalAction, type ActionCtx } from "./_generated/server";
import {
  applySecondOpinions, buildChecks, buildQuestions, buildRanking, buildVerdicts, earlyHints, hardRules, itemsFromReader, lineItems, type ReaderDish, type ReaderOpinion,
} from "../engine/pipeline";
import { applyRemembered, positionsFor, restaurantId, type RememberedAnswer, type TextLine } from "../engine/memory";
import { fromOpenFoodFacts, hasSubstance, itemFromProduct, mergeFacts, sanitiseNutrients, type ModelTag, type ProductFacts } from "../engine/product";
import { hidesInTerms } from "../engine/tagMatch";
import { linesFromVision, type VisionText } from "../engine/textLines";
import { judgeAvailable, judgeEnabledForScans, judgeItems } from "./judge";
import { TAGS, tagLabel } from "../engine/tags";
import { duplicateFindings, warningClauses, warningFindings, withLabelFindings, type ProfileItem, type Taking } from "../engine/otc";
import type { Item, Profile, Rule, Verdict } from "../engine/types";
import { ingredientsFor } from "./medications";

// One model per step, so a faster one can be tried on a step and judged by the benchmark. All default to READER_MODEL.
const READER = () => process.env.READER_MODEL || "claude-opus-5-5";
const MODELS = {
  transcribe: () => process.env.TRANSCRIBE_MODEL || READER(),
  tag: () => process.env.TAG_MODEL || READER(),
  check: () => process.env.CHECK_MODEL || READER(),
  explain: () => process.env.EXPLAIN_MODEL || READER(),
};
type Step = keyof typeof MODELS;
const NON_NUTRIENT_TAGS = TAGS.filter((t) => t.group !== "nutrient");
const NUTRIENT_TAGS = TAGS.filter((t) => t.group === "nutrient");
const tagIds = NON_NUTRIENT_TAGS.map((t) => t.id) as [string, ...string[]];
const nutrientIds = NUTRIENT_TAGS.map((t) => t.id) as [string, ...string[]];

class ScanError extends Error {}

/** One structured call to Claude. Throws ScanError with a message fit to show the user. */
async function ask<T extends z.ZodType>(client: Anthropic, step: Step, schema: T, system: string, content: Anthropic.ContentBlockParam[], model?: string): Promise<z.infer<T>> {
  const response = await client.messages.parse({
    model: model ?? MODELS[step](),
    max_tokens: 16000,
    system,
    messages: [{ role: "user", content }],
    output_config: { effort: "low", format: zodOutputFormat(schema) },
  });
  if (response.stop_reason === "refusal") throw new ScanError("The reader declined to process this photo.");
  if (response.stop_reason === "max_tokens") throw new ScanError("There is too much on this photo to read at once. Try one page or section at a time.");
  if (!response.parsed_output) throw new ScanError("The reader returned something we could not use. Please try again.");
  return response.parsed_output;
}

// ---- Not asking the same thing twice ----
//
// Tagging a set of dishes and the per-tag second pass depend only on the text sent, never on who is scanning, so the
// answer to one exact request can be kept and reused (convex/cache.ts). The key is a hash of everything that shapes
// the answer: the model, the instructions and the text. A hit therefore means the very same question; nothing is
// matched loosely, and the model is never shown less than it would have been. Only answers that parsed are kept, so
// a failed call is asked again next time. Not cached: reading the photo (each photo is new), the wording (it is
// written for one person's rules) and matching package warnings to a profile.

/** Bump when a cached step's output shape or meaning changes; every older entry then stops matching. */
const CACHE_VERSION = 1;
const TAG_CACHE_DAYS = 30;
/** Product records change (reformulations, corrections), so they are refetched weekly. */
const PRODUCT_CACHE_DAYS = 7;
const DAY_MS = 86_400_000;

export type AnswerCache = {
  get: (keys: string[]) => Promise<Map<string, string>>;
  put: (entries: { key: string; step: string; value: string }[]) => Promise<void>;
};

const cacheOn = () => process.env.SCAN_CACHE !== "off";

function answerCache(ctx: ActionCtx): AnswerCache | null {
  if (!cacheOn()) return null;
  return {
    get: async (keys) => {
      const rows: { key: string; value: string; at: number }[] = await ctx.runQuery(internal.cache.getAnswers, { keys });
      const oldest = Date.now() - TAG_CACHE_DAYS * DAY_MS;
      return new Map(rows.filter((r) => r.at >= oldest).map((r) => [r.key, r.value]));
    },
    put: async (entries) => {
      await ctx.runMutation(internal.cache.putAnswers, { entries });
    },
  };
}

function cacheKey(step: Step, system: string, text: string): string {
  return createHash("sha256").update(JSON.stringify([CACHE_VERSION, step, MODELS[step](), system, text])).digest("hex");
}

/**
 * Asks text-only questions through the cache. `prime` looks every request up in one query; `ask` answers from that
 * or calls the model; `flush` stores what was newly learnt. A cache that cannot be read or written is ignored: the
 * scan then simply asks the model, as it always did.
 */
export class Memo {
  private hits = new Map<string, string>();
  private fresh: { key: string; step: string; value: string }[] = [];
  constructor(private client: Anthropic, private cache: AnswerCache | null) {}

  async prime(requests: { step: Step; system: string; text: string }[]): Promise<void> {
    if (!this.cache || !requests.length) return;
    try {
      this.hits = await this.cache.get(requests.map((r) => cacheKey(r.step, r.system, r.text)));
    } catch (e) {
      console.error("cache read failed", e);
    }
  }

  async ask<T extends z.ZodType>(step: Step, schema: T, system: string, text: string): Promise<z.infer<T>> {
    const key = cacheKey(step, system, text);
    const hit = this.hits.get(key);
    if (hit !== undefined) {
      try {
        const parsed = schema.safeParse(JSON.parse(hit));
        if (parsed.success) return parsed.data;
      } catch {
        // An entry that no longer parses is treated as absent and replaced below.
      }
    }
    const answer = await ask(this.client, step, schema, system, [{ type: "text", text }]);
    if (this.cache) this.fresh.push({ key, step, value: JSON.stringify(answer) });
    return answer;
  }

  async flush(): Promise<void> {
    if (!this.cache || !this.fresh.length) return;
    const entries = this.fresh;
    this.fresh = [];
    try {
      await this.cache.put(entries);
    } catch (e) {
      console.error("cache write failed", e);
    }
  }
}

// ---- 1. Transcribe the photo (the only step that looks at the image) ----

const num = z.number().nullable();
const TranscribeSchema = z.object({
  kind: z.enum(["menu", "product", "label", "unknown"]),
  restaurantName: z.string(),
  unreadable: z.string(),
  dishes: z.array(z.object({ name: z.string(), description: z.string() })),
  label: z.object({
    productName: z.string(),
    brand: z.string(),
    panel: z.enum(["nutrition_facts", "supplement_facts", "drug_facts", "none"]),
    ingredientsText: z.string(),
    containsStatement: z.string(),
    mayContainStatement: z.string(),
    servingSize: z.string(),
    activeIngredients: z.array(z.object({ name: z.string(), amount: z.string() })),
    warnings: z.object({ doNotUse: z.string(), askDoctor: z.string(), askDoctorOrPharmacist: z.string(), stopUse: z.string() }),
    sodiumMg: num, potassiumMg: num, totalSugarG: num, addedSugarG: num, saturatedFatG: num, carbsG: num, proteinG: num, fiberG: num, calories: num,
  }),
});

const TRANSCRIBE_SYSTEM = `You transcribe photos for an app that helps people with allergies, medications and dietary limits choose food.
Code checks later steps against your transcription, so copy exactly what is printed.

First decide what the photo shows: "menu" (a restaurant or cafe menu), "label" (a package's ingredient list and/or nutrition
panel is readable), "product" (a packaged product, but no ingredient list or nutrition panel is readable), or "unknown".

For a menu, fill "dishes" with every orderable item (food and drinks), in the order printed. Skip section headings, prices and footnotes.
- name, description: exactly what is printed for that item. Do not add, translate, tidy or guess. Empty description if none is printed.
- restaurantName: only if printed on the menu, else "".
Leave "dishes" empty for anything that is not a menu.

For a label or product, fill "label" (leave its text fields "" and its numbers null for a menu):
- productName, brand: as printed, "" if not visible.
- panel: which facts panel is visible, if any.
- ingredientsText: the full ingredient list exactly as printed, without the word "Ingredients:". "" if not visible.
- containsStatement: the allergen statement exactly as printed ("Contains: Milk, Soy."). "" if none.
- mayContainStatement: any "may contain" or "made in a facility that also processes" statement, exactly as printed. "" if none.
- servingSize: as printed.
- activeIngredients: for a Drug Facts panel, each active ingredient and its amount as printed; for a Supplement Facts
  panel, each listed ingredient and its amount. Empty for food.
- warnings: for a Drug Facts panel only, the text printed under each of these headings, copied exactly, bullets included:
  "Do not use", "Ask a doctor before use if you have", "Ask a doctor or pharmacist before use if you are",
  "Stop use and ask a doctor if". "" for any heading that is not printed or not readable.
- the numbers: per serving, exactly as printed on the nutrition panel, converted only to the unit in the field name.
  Use null for anything not printed or not readable. Never estimate a number.

- unreadable: if part of the photo is too blurry, cropped or dark to read, say which part in a few words; else "".`;

export type Transcription = z.infer<typeof TranscribeSchema>;

/**
 * Read one or more photos. `model` overrides the configured reader; only bench/compareReaders.mjs passes it, to
 * put two models side by side on the same photo.
 */
export async function transcribe(client: Anthropic, imageUrls: string[], model?: string): Promise<Transcription> {
  return await ask(
    client, "transcribe", TranscribeSchema, TRANSCRIBE_SYSTEM,
    [...imageUrls.map((url): Anthropic.ContentBlockParam => ({ type: "image", source: { type: "url", url } })), { type: "text", text: "Transcribe this photo." }],
    model,
  );
}

/** The model that reads photos when nothing overrides it. */
export const readerModel = () => MODELS.transcribe();

// ---- 1b. Where the text is on the photo ----
//
// Outlining each dish on the photo needs the position of every printed line. The phone can send them (on-device
// recognition, in a development build); when it has not, a text-recognition service reads them from the photo here.
// The service only locates text: which lines belong to which dish is decided by code from the dish's own words
// (engine/memory.ts positionsFor), and what the dishes ARE still comes from the reader above. With no
// GOOGLE_VISION_API_KEY set, or if the call fails or is slow, the scan carries on without positions.

const LINES_TIMEOUT_MS = 6000;

async function recogniseLines(imageUrl: string): Promise<TextLine[] | null> {
  const key = process.env.GOOGLE_VISION_API_KEY;
  if (!key) return null;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), LINES_TIMEOUT_MS);
  try {
    const photo = await fetch(imageUrl, { signal: abort.signal });
    if (!photo.ok) return null;
    const content = Buffer.from(await photo.arrayBuffer()).toString("base64");
    const res = await fetch("https://vision.googleapis.com/v1/images:annotate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
      body: JSON.stringify({ requests: [{ image: { content }, features: [{ type: "DOCUMENT_TEXT_DETECTION" }] }] }),
      signal: abort.signal,
    });
    if (!res.ok) {
      console.error("text recognition failed", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const data = (await res.json()) as { responses?: { fullTextAnnotation?: VisionText; error?: { message?: string } }[] };
    if (data.responses?.[0]?.error) console.error("text recognition failed", data.responses[0].error.message);
    return linesFromVision(data.responses?.[0]?.fullTextAnnotation);
  } catch (e) {
    console.error("text recognition failed", e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---- 2a. Tag the dishes (text only, in parallel chunks) ----

const TagSchema = z.object({
  dishes: z.array(
    z.object({
      index: z.number(),
      ingredients: z.array(z.object({ name: z.string(), stated: z.boolean(), evidence: z.string() })),
      tags: z.array(z.object({ tag: z.enum(tagIds), sureness: z.enum(["certain", "likely", "unsure"]), evidence: z.string() })),
      levels: z.array(z.object({ nutrient: z.enum(nutrientIds), level: z.enum(["low", "medium", "high"]) })),
    }),
  ),
});

const TAG_SYSTEM = `You tag restaurant dishes for an app that helps people with allergies, medications and dietary limits choose food.
Code checks your output: a tag whose evidence is not found in the dish's printed text is discarded.

For each numbered dish return:
- ingredients: the main things it contains, at most eight.
  - stated = true only if the ingredient is named in the dish's printed name or description; then evidence is the exact
    printed word or phrase, copied character for character.
  - stated = false for an ingredient the dish typically contains but the menu does not name; evidence is "".
- tags: use only the ids provided. Tag a dish when it contains, or is commonly prepared with, the tagged thing.
  - evidence is REQUIRED: the exact word or phrase from the dish's printed name or description that led you to the tag
    (for pesto pasta and tree nuts, the evidence is "pesto"). If no printed word supports a tag, do not give the tag.
  - sureness: "certain" if the menu names it, "likely" if the dish almost always has it, "unsure" if it often does.
  - Be generous with "unsure" tags for allergens: a missed allergen is far worse than an extra question.
- levels: your rough estimate for a normal serving, only for nutrients you can reasonably judge from the dish.
Return one entry per dish, using the dish's number as index.

Tag ids:
${NON_NUTRIENT_TAGS.map((t) => `- ${t.id}: ${t.label}`).join("\n")}

Nutrient ids for levels:
${NUTRIENT_TAGS.map((t) => `- ${t.id}: ${t.label}`).join("\n")}`;

const TAG_CHUNK = Number(process.env.TAG_CHUNK) || 3;

// ---- 2b. Second pass: one narrow question per hard rule, each in its own call ----

const SecondPassSchema = z.object({
  flagged: z.array(z.object({ index: z.number(), answer: z.enum(["yes", "maybe"]), why: z.string() })),
});

const SECOND_PASS_SYSTEM = `You are a careful second check for a food-allergy and food-restriction app.
You are asked about ONE thing to watch for. Go through every numbered dish and decide whether a normal restaurant
preparation of it contains that thing, or is commonly prepared with it.
- "yes": the dish names it or almost always contains it.
- "maybe": it often contains it, or it depends on the kitchen (sauces, garnishes, stocks, marinades, dressings, toppings).
Return only the dishes that are "yes" or "maybe", each with a few words on why. Leave out dishes where a normal
preparation does not contain it. Think about hidden sources, but do not flag a dish without a concrete reason.`;

// ---- 2c. Packaged products ----

const PRODUCT_TAG_SYSTEM = `You tag the ingredient list of a packaged food for an app that helps people with allergies, medications and dietary limits.
Code has already tagged every ingredient it recognises by name. Your job is the ones a name match misses: ingredients that
are, or are made from, a tagged thing under another name (sodium caseinate and whey are dairy; albumin is egg; semolina is
wheat; malt is gluten; tahini is sesame).
- Use only the tag ids provided.
- evidence is REQUIRED and must be the ingredient exactly as it appears in the list. If no ingredient supports a tag, do not give it.
- sureness: "certain" when the ingredient always is or contains it, "likely" when it nearly always does, "unsure" when it may.
- Do not tag vague ingredients ("natural flavors", "spices") with a major allergen: U.S. labels must name milk, egg, fish,
  shellfish, tree nuts, peanuts, wheat, soy and sesame when present.
Return one entry with index 1. Leave ingredients and levels empty.

Tag ids:
${NON_NUTRIENT_TAGS.map((t) => `- ${t.id}: ${t.label}`).join("\n")}`;

const PRODUCT_CHECK_SYSTEM = `You are a careful second check for a food-allergy and food-restriction app.
You are given the ingredient list of ONE packaged product and ONE thing to watch for.
- "yes": an ingredient is that thing, or is clearly made from it, even under another name.
- "maybe": an ingredient could reasonably be a source of it and the list does not settle it.
Do not answer "maybe" just because a vague ingredient such as "natural flavors" or "spices" is present: U.S. labels must
name the major allergens (milk, egg, fish, shellfish, tree nuts, peanuts, wheat, soy, sesame) when present.
If the product is "yes" or "maybe", return it as index 1 with a few words on which ingredient and why. Otherwise return an empty list.`;

const WarnSchema = z.object({ picks: z.array(z.object({ clause: z.number(), about: z.string(), why: z.string() })) });

const WARN_SYSTEM = `You are given numbered warning lines copied word for word from the package of an over-the-counter medicine,
and a short list of things in one person's profile: medicines they take (with active ingredients) and conditions they have.

Pick the lines whose condition is clearly met by a specific item in the profile. For each, return:
- clause: the line's number.
- about: the profile item it applies to, copied exactly as written in the profile list.
- why: a few words on the link ("apixaban is a blood thinner").

Rules:
- A line applies only if the profile item plainly is what the line describes: "taking a blood thinning (anticoagulant)
  drug" applies to someone taking apixaban or warfarin; "high blood pressure" applies to someone with hypertension;
  "stomach bleeding" or "ulcers" does not apply to someone just because they have another digestive condition.
- Do not pick lines about things not in the profile (age, pregnancy, symptoms, alcohol use, other products).
- Do not pick catch-all lines that would apply to anyone on any medicine or under any care ("taking any other drug",
  "under a doctor's care for any serious condition"). Pick only lines that name a kind of medicine or a condition.
- If you are not sure a line applies, do not pick it. An empty list is a fine answer.
- You are only matching lines to the profile. Do not give advice.`;

const ProductWordSchema = z.object({ summary: z.string(), explanation: z.string(), note: z.string() });

const PRODUCT_WORD_SYSTEM = () => `${WORDING_LIMITS}

You are wording the result for one packaged product.
Return:
- summary: one or two sentences: how it fits this person and the main reason.
- explanation: two or three sentences built from the findings, using their numbers as given.
- note: optional. A real concern that the findings do not already cover and that follows from the person's rules, or "".
  It is shown as "noted by the assistant, no cited source". If in doubt, leave it "".`;

async function fetchProduct(barcode: string): Promise<ProductFacts | null> {
  const code = barcode.replace(/\D/g, "");
  if (!code) return null;
  const fields = "product_name,brands,ingredients_text,ingredients_text_en,allergens_tags,traces_tags,nutriments";
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${fields}`, { headers: { "User-Agent": "second-look/0.1" } });
  if (!res.ok) return null;
  return fromOpenFoodFacts(await res.json());
}

/** The database's record for a barcode, from the cache when it is recent. Only records with something in them are kept. */
async function lookUpProduct(ctx: ActionCtx, barcode: string): Promise<ProductFacts | null> {
  const code = barcode.replace(/\D/g, "");
  if (!code) return null;
  if (cacheOn()) {
    try {
      const hit: { facts: string; at: number } | null = await ctx.runQuery(internal.cache.getProduct, { barcode: code });
      if (hit && hit.at >= Date.now() - PRODUCT_CACHE_DAYS * DAY_MS) return JSON.parse(hit.facts) as ProductFacts;
    } catch (e) {
      console.error("product cache read failed", e);
    }
  }
  const facts = await fetchProduct(code);
  if (facts && hasSubstance(facts) && cacheOn()) {
    try {
      await ctx.runMutation(internal.cache.putProduct, { barcode: code, facts: JSON.stringify(facts) });
    } catch (e) {
      console.error("product cache write failed", e);
    }
  }
  return facts;
}

// ---- 3. Rank and explain ----

const RankSchema = z.object({
  summary: z.string(),
  ranking: z.array(z.object({ itemId: z.string(), line: z.string(), modification: z.string() })),
});

const ExplainSchema = z.object({
  explanations: z.array(z.object({ itemId: z.string(), text: z.string() })),
  notes: z.array(z.object({ itemId: z.string(), note: z.string() })),
});

const WORDING_LIMITS = `You write the wording for a food-fit app. Code has already decided each dish's verdict from the person's own rules.
You may not change, soften or contradict a verdict or a finding. You only order, word and explain.

Hard limits on what you write:
- Never say a dish is "safe". Never tell anyone to take, stop or change a medication. Never give medical advice.
- Use only the facts in the findings and the dish text. Do not introduce health claims of your own.
- Plain, short, warm sentences. No lists, no headings, no emoji.`;

const RANK_SYSTEM = `${WORDING_LIMITS}

Return:
- summary: two or three sentences for the top of the result: what looks best and why, what is out, what to ask.
- ranking: for dishes with fit "good", "okay" or "cant_tell" only, best choice first for this person.
  line = one short reason (under 60 characters), written as a plain phrase. Do not start it with the verdict
  ("Good fit:", "Okay:", "Check:"); the app already shows that. modification = a concrete, optional way to order it that helps with one
  of their LIMIT rules ("ask for the dressing on the side"), or "" if there is none worth suggesting.
  Never suggest a way around a NEVER or AVOID rule (no "ask for it without the nuts"): leaving an ingredient off does not
  make a dish fit an allergy. For those, the only thing to suggest is asking the staff.`;

const EXPLAIN_SYSTEM = `${WORDING_LIMITS}

Return:
- explanations: one or two sentences for each dish listed, built from that dish's findings.
- notes: optional. At most one per dish, and only for a real concern that the findings do not already cover and that follows
  from the person's rules. These are shown as "noted by the assistant, no cited source". If in doubt, leave notes empty.`;

const EXPLAIN_CHUNK = 7;

function describeForWording(items: Item[], verdicts: Record<string, Verdict>, rules: Rule[]): string {
  const ruleText = rules
    .filter((r) => r.enabled)
    .map((r) => `- [${r.id}] ${r.level.toUpperCase()} ${tagLabel(r.tag)} (because: ${r.from.label})`)
    .join("\n");
  const dishText = items
    .map((it) => {
      const vd = verdicts[it.id];
      const findings = vd.findings.map((f) => `    - ${f.outcome}${f.ruleId ? ` [${f.ruleId}]` : ""}: ${f.because}`).join("\n");
      return `- id ${it.id}: ${it.name}${it.description ? ` — ${it.description}` : ""}\n  fit: ${vd.fit}${vd.score !== undefined ? ` (score ${vd.score})` : ""}\n  findings:\n${findings || "    (none)"}`;
    })
    .join("\n");
  return `The person's rules:\n${ruleText || "(none: no profile yet, so this is a generic reading)"}\n\nDishes and verdicts:\n${dishText}`;
}

/**
 * From transcribed dishes to tagged Items plus the reader's per-rule opinions. Text only; no photo, no profile.
 * A dish the second pass did not flag is a "no" for that tag: it looked at every dish.
 * With a `cache`, a request identical to one already answered is not sent again. The benchmark passes none, so it
 * always measures the models themselves.
 */
export async function tagAndCheck(
  client: Anthropic,
  printed: { name: string; description: string }[],
  watch: string[],
  cache: AnswerCache | null = null,
): Promise<{ items: Item[]; opinions: ReaderOpinion[] }> {
  const numbered = (from: number, to: number) =>
    printed.slice(from, to).map((d, i) => `${from + i + 1}. ${d.name}${d.description.trim() ? ` — ${d.description}` : ""}`).join("\n");
  const chunkStarts = Array.from({ length: Math.ceil(printed.length / TAG_CHUNK) }, (_, i) => i * TAG_CHUNK);
  const tagTexts = chunkStarts.map((from) => `Dishes:\n${numbered(from, from + TAG_CHUNK)}`);
  const checkTexts = watch.map((t) => `Thing to watch for: ${tagLabel(t)}.\nIt commonly hides in: ${hidesInTerms(t).slice(0, 25).join(", ") || "(no list)"}.\n\nDishes:\n${numbered(0, printed.length)}`);
  const memo = new Memo(client, cache);
  await memo.prime([
    ...tagTexts.map((text) => ({ step: "tag" as const, system: TAG_SYSTEM, text })),
    ...checkTexts.map((text) => ({ step: "check" as const, system: SECOND_PASS_SYSTEM, text })),
  ]);
  const [tagged, flaggedPerTag] = await Promise.all([
    Promise.all(tagTexts.map((text) => memo.ask("tag", TagSchema, TAG_SYSTEM, text))),
    Promise.all(checkTexts.map((text) => memo.ask("check", SecondPassSchema, SECOND_PASS_SYSTEM, text))),
  ]);
  await memo.flush();
  const dishes: ReaderDish[] = printed.map((d) => ({ name: d.name, description: d.description, ingredients: [], tags: [], levels: [] }));
  for (const chunk of tagged) {
    for (const t of chunk.dishes) {
      const d = dishes[t.index - 1];
      if (d) Object.assign(d, { ingredients: t.ingredients, tags: t.tags, levels: t.levels });
    }
  }
  const items = itemsFromReader(dishes);
  const opinions: ReaderOpinion[] = [];
  watch.forEach((tag, k) => {
    const flagged = new Map(flaggedPerTag[k].flagged.map((f) => [f.index, f.answer]));
    items.forEach((it, i) => opinions.push({ itemId: it.id, tag, answer: flagged.get(i + 1) ?? "no" }));
  });
  return { items, opinions };
}

export const run = internalAction({
  args: { scanId: v.id("scans") },
  handler: async (ctx, { scanId }): Promise<null> => {
    const fail = async (error: string): Promise<null> => {
      await ctx.runMutation(internal.scans.patch, { scanId, status: "failed", error });
      return null;
    };
    try {
      const scan: {
        barcode: string | null; rules: Rule[]; imageUrls: string[]; deviceId: string;
        location: { lat: number; lng: number } | null; lines: TextLine[] | null; profile: Profile | null;
      } | null = await ctx.runQuery(internal.scans.load, { scanId });
      if (!scan) return null;
      if (!scan.imageUrls.length && !scan.barcode) return await fail("A scan needs a photo or a barcode.");
      if (!process.env.ANTHROPIC_API_KEY) return await fail("The backend has no ANTHROPIC_API_KEY set.");
      const client = new Anthropic();

      // The person's medication rules may still be being read from FDA labels (they have just set up, or changed,
      // their profile). Wait for that while the photo is transcribed, then take the rules as they are now.
      const rulesReady = (async (): Promise<boolean> => {
        for (let i = 0; i < 30; i++) {
          const stillReading: boolean = await ctx.runQuery(internal.drugRules.pending, { deviceId: scan.deviceId });
          if (!stillReading) return true;
          await new Promise((r) => setTimeout(r, 1000));
        }
        return false;
      })();

      // Where the text is on the first photo, found while the photo is being read. Stored as soon as it is known,
      // so the app can outline the text before any dish has a name.
      const linesReady: Promise<TextLine[] | null> = scan.lines?.length
        ? Promise.resolve(scan.lines)
        : scan.imageUrls.length
          ? recogniseLines(scan.imageUrls[0]).then(async (found) => {
              if (found?.length) await ctx.runMutation(internal.scans.patch, { scanId, lines: found });
              // A first signal while the photo is still being read: which lines already look like trouble. Code's
              // own reading of the words first (instant), then the judge's. Not waited for, and never allowed to
              // disturb the scan: the dishes' own verdicts replace it as soon as they exist.
              const watchFor = hardRules(scan.rules);
              if (found?.length && watchFor.length) {
                void (async () => {
                  try {
                    const usable = found.filter((l) => /[a-z]{4}/i.test(l.text)).slice(0, 60);
                    const byCode = earlyHints(usable, scan.rules);
                    if (byCode.length) await ctx.runMutation(internal.scans.patch, { scanId, hints: byCode });
                    if (!judgeAvailable()) return;
                    const withJudge = earlyHints(usable, scan.rules, await judgeItems(lineItems(usable), watchFor));
                    if (withJudge.length) await ctx.runMutation(internal.scans.patch, { scanId, hints: withJudge });
                  } catch (e) {
                    console.error("early hints failed", e);
                  }
                })();
              }
              return found;
            }).catch(() => null)
          : Promise.resolve(null);

      // 1. Transcribe. This is the only call that reads the photo for meaning.
      const read = scan.imageUrls.length ? await transcribe(client, scan.imageUrls) : null;
      const ready = await rulesReady;
      const rules: Rule[] = await ctx.runMutation(internal.scans.refreshRules, { scanId });
      if (!ready) {
        await ctx.runMutation(internal.scans.patch, {
          scanId, notice: "Your medication rules were still being read when this ran, so this result may not include them. Scan again in a minute.",
        });
      }

      if (!read || read.kind !== "menu") {
        // ---- Packaged product: a label photo, a barcode, or both. The label wins where it has something. ----
        if (read?.kind === "unknown" && !scan.barcode) {
          await ctx.runMutation(internal.scans.patch, { scanId, kind: "unknown" });
          return await fail(`We could not tell what this photo shows${read.unreadable ? ` (${read.unreadable})` : ""}. Try again with the menu or label filling the frame.`);
        }
        const l = read && read.kind !== "unknown" ? read.label : null;
        const labelFacts: ProductFacts | null = l
          ? {
              source: "label",
              // Part of the photo could not be read: what we did read is used, but its silence is not believed.
              ...(read?.unreadable.trim() ? { incomplete: true } : {}),
              panel: l.panel === "drug_facts" ? "otc" : l.panel === "supplement_facts" ? "supplement" : "food",
              ...(l.activeIngredients.some((a) => a.name.trim()) ? { actives: l.activeIngredients.filter((a) => a.name.trim()).map((a) => ({ name: a.name.trim(), ...(a.amount.trim() ? { amount: a.amount.trim() } : {}) })) } : {}),
              name: l.productName.trim(),
              ...(l.brand.trim() ? { brand: l.brand.trim() } : {}),
              ...(l.ingredientsText.trim() ? { ingredientsText: l.ingredientsText.trim() } : {}),
              ...(l.containsStatement.trim() ? { contains: l.containsStatement.trim() } : {}),
              ...(l.mayContainStatement.trim() ? { mayContain: l.mayContainStatement.trim() } : {}),
              ...((n) => (n ? { nutrients: n } : {}))(
                sanitiseNutrients(
                  { sodiumMg: l.sodiumMg ?? undefined, potassiumMg: l.potassiumMg ?? undefined, sugarG: l.totalSugarG ?? undefined, addedSugarG: l.addedSugarG ?? undefined, satFatG: l.saturatedFatG ?? undefined, carbsG: l.carbsG ?? undefined, proteinG: l.proteinG ?? undefined, fiberG: l.fiberG ?? undefined, kcal: l.calories ?? undefined },
                  "serving",
                ),
              ),
            }
          : null;
        const dbFacts = scan.barcode ? await lookUpProduct(ctx, scan.barcode).catch(() => null) : null;
        const labelHasSubstance = hasSubstance(labelFacts);
        const facts = mergeFacts(labelFacts && (labelHasSubstance || labelFacts.name) ? labelFacts : null, dbFacts);
        const kind = labelHasSubstance ? "label" : "product";
        if (!facts || !hasSubstance(facts)) {
          await ctx.runMutation(internal.scans.patch, { scanId, kind });
          return await fail(
            scan.barcode && !scan.imageUrls.length
              ? "We do not have this product on file. Take a photo of its ingredient list instead."
              : "We can see the product but not its ingredients. Turn it over and photograph the ingredient list, or scan the barcode.",
          );
        }
        if (!facts.name) facts.name = "This product";
        await ctx.runMutation(internal.scans.patch, { scanId, kind, items: [itemFromProduct(facts)], status: "judging" });

        const hard = hardRules(rules);
        // Fast first pass on the ingredient list, shown as provisional until the careful check lands.
        if (judgeAvailable() && hard.length && (facts.ingredientsText?.trim() || facts.actives?.length)) {
          try {
            const quickItem = itemFromProduct(facts);
            const quick = await judgeItems([quickItem], hard);
            if (quick.length) {
              const quickChecks = buildChecks([quickItem], rules, [], quick);
              const quickVerdicts = buildVerdicts([quickItem], rules, quickChecks);
              await ctx.runMutation(internal.scans.patch, {
                scanId, checks: quickChecks, verdicts: quickVerdicts, ranking: buildRanking([quickItem], quickVerdicts, rules), provisional: true,
              });
            }
          } catch (e) {
            console.error("fast first pass failed", e);
          }
        }
        const watch = [...new Set(hard.map((r) => r.tag))];
        const list = [...(facts.actives ?? []).map((a) => `${a.name}${a.amount ? ` ${a.amount}` : ""}`), facts.ingredientsText?.trim() ?? ""].filter(Boolean).join(", ");
        let modelTags: ModelTag[] = [];
        let opinions: ReaderOpinion[] = [];
        if (list) {
          const listing = `Product: ${facts.name}\nIngredients: ${list}${facts.contains ? `\n${facts.contains}` : ""}${facts.mayContain ? `\n${facts.mayContain}` : ""}`;
          const checkTexts = watch.map((t) => `Thing to watch for: ${tagLabel(t)}.\n\n${listing}`);
          const memo = new Memo(client, answerCache(ctx));
          await memo.prime([{ step: "tag", system: PRODUCT_TAG_SYSTEM, text: listing }, ...checkTexts.map((text) => ({ step: "check" as const, system: PRODUCT_CHECK_SYSTEM, text }))]);
          const [tagged, flaggedPerTag] = await Promise.all([
            // A tagging call that failed is answered with nothing for this scan, and is not remembered.
            memo.ask("tag", TagSchema, PRODUCT_TAG_SYSTEM, listing).catch((e) => {
              console.error("product tagging failed", e);
              return { dishes: [] };
            }),
            Promise.all(checkTexts.map((text) => memo.ask("check", SecondPassSchema, PRODUCT_CHECK_SYSTEM, text))),
          ]);
          await memo.flush();
          modelTags = tagged.dishes.flatMap((d) => d.tags);
          opinions = watch.map((tag, k) => ({ itemId: "p1", tag, answer: flaggedPerTag[k].flagged[0]?.answer ?? ("no" as const) }));
        }
        const item = itemFromProduct(facts, modelTags);
        const checks = buildChecks([item], rules, opinions, list && judgeEnabledForScans() ? await judgeItems([item], hard) : []);
        let verdicts = buildVerdicts([item], rules, checks);

        // A medicine's own package warnings, and ingredients the person already takes. Quoted from the label;
        // they can only make the verdict more cautious.
        if (facts.panel === "otc" && l && scan.profile) {
          const profileItems: ProfileItem[] = [
            ...scan.profile.medications.map((m) => ({ label: m.name.trim(), kind: "medication" as const })),
            ...scan.profile.conditions.map((c) => ({ label: c.name.trim(), kind: "condition" as const })),
          ].filter((p) => p.label);
          const taking: Taking[] = await Promise.all(
            scan.profile.medications.filter((m) => m.name.trim()).map(async (m) => ({
              medication: m.name.trim(),
              ingredients: (await ingredientsFor(m.name).catch(() => [])).map((i) => i.name),
            })),
          );
          const clauses = warningClauses({ do_not_use: l.warnings.doNotUse, ask_doctor: l.warnings.askDoctor, ask_doctor_or_pharmacist: l.warnings.askDoctorOrPharmacist, stop_use: "" });
          let picks: { clause: number; about: string; why: string }[] = [];
          if (clauses.length && profileItems.length) {
            const picked = await ask(client, "check", WarnSchema, WARN_SYSTEM, [
              {
                type: "text",
                text:
                  `Profile:\n${profileItems.map((p) => `- ${p.label} (${p.kind}${p.kind === "medication" ? `; active ingredient: ${taking.find((t) => t.medication === p.label)?.ingredients.join(", ") || "unknown"}` : ""})`).join("\n")}` +
                  `\n\nWarning lines from the package of ${facts.name}:\n${clauses.map((c, i) => `${i + 1}. [${c.section.replace(/_/g, " ")}] ${c.text}`).join("\n")}`,
              },
            ]).catch((e) => {
              console.error("warning matching failed", e);
              return { picks: [] };
            });
            picks = picked.picks;
          }
          const extra = [...warningFindings(clauses, picks, profileItems, facts.name), ...duplicateFindings(facts.actives ?? [], taking, facts.name)];
          verdicts = { ...verdicts, [item.id]: withLabelFindings(verdicts[item.id], extra) };
        }

        const questions = buildQuestions([item], verdicts);
        await ctx.runMutation(internal.scans.patch, {
          scanId, items: [item], checks, verdicts, questions, ranking: buildRanking([item], verdicts, rules), status: "ranking", provisional: false,
        });
        try {
          const worded = await ask(client, "explain", ProductWordSchema, PRODUCT_WORD_SYSTEM(), [{ type: "text", text: describeForWording([item], verdicts, rules) }]);
          if (worded.note.trim()) verdicts = applySecondOpinions(verdicts, [{ itemId: item.id, note: worded.note.trim() }]);
          await ctx.runMutation(internal.scans.patch, {
            scanId, verdicts, status: "done",
            ...(worded.summary.trim() ? { summary: worded.summary.trim() } : {}),
            ...(worded.explanation.trim() ? { explanations: { [item.id]: worded.explanation.trim() } } : {}),
          });
        } catch (e) {
          console.error("product wording failed", e);
          await ctx.runMutation(internal.scans.patch, { scanId, status: "done" });
        }
        return null;
      }

      // ---- Menu ----
      const printed = read.dishes.filter((d) => d.name.trim());
      if (!printed.length) return await fail(read.unreadable ? `We could not read the menu: ${read.unreadable}.` : "We could not find any dishes on this photo.");
      const bare: ReaderDish[] = printed.map((d) => ({ name: d.name, description: d.description, ingredients: [], tags: [], levels: [] }));
      // Where each dish is on the photo (first photo only), from its own printed words. Worked out once, here, and
      // put on every version of the items from now on, so the outlines are there as soon as the names are.
      const lines = await linesReady;
      const positions = lines?.length ? positionsFor(printed, lines) : [];
      const placed = (list: Item[]): Item[] => {
        positions.forEach((boxes, i) => boxes && list[i] && (list[i].position = boxes));
        return list;
      };
      // Show the dish list straight away; tags and verdicts follow.
      await ctx.runMutation(internal.scans.patch, {
        scanId, kind: "menu", items: placed(itemsFromReader(bare)), status: "judging", ...(read.restaurantName.trim() ? { restaurantName: read.restaurantName.trim() } : {}),
      });
      // 2. Tagging and the per-rule second pass run side by side; both work from the transcription alone.
      //    The judge then gives its own probability per dish and rule, if it is configured.
      const hard = hardRules(rules);
      const careful = tagAndCheck(client, printed, [...new Set(hard.map((r) => r.tag))], answerCache(ctx));
      careful.catch(() => {}); // awaited below; this only stops an early failure being reported as unhandled

      // Fast first pass: while the careful check runs, the judge reads each dish in a fraction of a second and the
      // result is shown as provisional. It is replaced, never merged, when the careful check lands.
      if (judgeAvailable() && hard.length) {
        try {
          const quickItems = itemsFromReader(bare);
          const quick = await judgeItems(quickItems, hard);
          if (quick.length) {
            const quickChecks = buildChecks(quickItems, rules, [], quick);
            const quickVerdicts = buildVerdicts(quickItems, rules, quickChecks);
            await ctx.runMutation(internal.scans.patch, {
              scanId, checks: quickChecks, verdicts: quickVerdicts, ranking: buildRanking(quickItems, quickVerdicts, rules), provisional: true,
            });
          }
        } catch (e) {
          console.error("fast first pass failed", e);
        }
      }

      const { items, opinions } = await careful;
      const judged = judgeEnabledForScans() ? await judgeItems(items, hard) : [];
      placed(items);
      // What this restaurant has told people before.
      const rid = restaurantId(read.restaurantName, scan.location ?? undefined);
      const remembered: RememberedAnswer[] = rid ? await ctx.runQuery(internal.scans.remembered, { restaurantId: rid }) : [];
      const checks = applyRemembered(buildChecks(items, rules, opinions, judged), items, rules, remembered, scan.deviceId, new Date());
      let verdicts = buildVerdicts(items, rules, checks);
      const questions = buildQuestions(items, verdicts);
      // Show a usable result now: code-written lines until the wording arrives.
      await ctx.runMutation(internal.scans.patch, {
        scanId, items, checks, verdicts, questions, ranking: buildRanking(items, verdicts, rules), status: "ranking", provisional: false, ...(rid ? { restaurantId: rid } : {}),
      });

      // 3. Wording. Ranking (short) and explanations (longer, in chunks) run side by side; the ranking is shown as
      // soon as it lands. If wording fails, the scan is still complete and correct, just plainly worded.
      const rankStep = ask(client, "explain", RankSchema, RANK_SYSTEM, [{ type: "text", text: describeForWording(items, verdicts, rules) }])
        .then(async (ranked) => {
          await ctx.runMutation(internal.scans.patch, {
            scanId, ranking: buildRanking(items, verdicts, rules, ranked.ranking), status: "explaining", ...(ranked.summary.trim() ? { summary: ranked.summary.trim() } : {}),
          });
          return ranked;
        })
        .catch((e) => {
          console.error("ranking step failed", e);
          return null;
        });
      const explainStarts = Array.from({ length: Math.ceil(items.length / EXPLAIN_CHUNK) }, (_, i) => i * EXPLAIN_CHUNK);
      const explainStep = Promise.all(
        explainStarts.map((from) =>
          ask(client, "explain", ExplainSchema, EXPLAIN_SYSTEM, [{ type: "text", text: describeForWording(items.slice(from, from + EXPLAIN_CHUNK), verdicts, rules) }]).catch((e) => {
            console.error("explain step failed", e);
            return { explanations: [], notes: [] };
          }),
        ),
      );
      const [ranked, explained] = await Promise.all([rankStep, explainStep]);
      const known = new Set(items.map((i) => i.id));
      const explanations: Record<string, string> = {};
      for (const e of explained.flatMap((x) => x.explanations)) if (known.has(e.itemId) && e.text.trim()) explanations[e.itemId] = e.text.trim();
      verdicts = applySecondOpinions(verdicts, explained.flatMap((x) => x.notes).filter((n) => known.has(n.itemId) && n.note.trim()));
      await ctx.runMutation(internal.scans.patch, {
        scanId, verdicts, explanations, ranking: buildRanking(items, verdicts, rules, ranked?.ranking ?? []), status: "done",
      });
      return null;
    } catch (e) {
      console.error("scan failed", e);
      return await fail(e instanceof ScanError ? e.message : "Something went wrong while reading this photo. Please try again.");
    }
  },
});
