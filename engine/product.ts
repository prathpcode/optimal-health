// Packaged products: turning a label reading or a food-database record into an Item. Pure.

import supplementNamesJson from "../data/supplementNames.json";
import { containsTerm, literalTags, normalise } from "./tagMatch";
import { isKnownTag, tagInfo } from "./tags";
import type { Item, ItemTag, Nutrients, Sureness, TagId } from "./types";

export type ProductFacts = {
  /** Where the facts came from. A label photo outranks the database. */
  source: "label" | "database";
  /** What kind of product the facts panel says it is. Defaults to food. */
  panel?: "food" | "supplement" | "otc";
  /** Active ingredients of a supplement or medicine, as printed. */
  actives?: { name: string; amount?: string }[];
  /** True when part of the label could not be read. */
  incomplete?: boolean;
  name: string;
  brand?: string;
  /** The ingredient list as printed. */
  ingredientsText?: string;
  /** The "Contains: ..." allergen statement as printed. */
  contains?: string;
  /** The "May contain ..." / "Made in a facility that ..." statement as printed. */
  mayContain?: string;
  nutrients?: Nutrients;
  /** Allergens a database declares outright, already mapped to our tags. */
  declaredAllergens?: TagId[];
  /** Allergens a database lists as possible traces. */
  traceAllergens?: TagId[];
};

const SUPPLEMENT_NAMES = supplementNamesJson.names as Record<TagId, string[]>;

/** Supplement tags named in a supplement's or medicine's ingredient text. Never applied to food. */
export function supplementTags(text: string): { tag: TagId; term: string }[] {
  const n = normalise(text);
  const found: { tag: TagId; term: string }[] = [];
  for (const [tag, terms] of Object.entries(SUPPLEMENT_NAMES)) {
    const term = terms.find((t) => containsTerm(n, t));
    if (term) found.push({ tag, term });
  }
  return found;
}

/** Open Food Facts allergen ids -> our tags. */
const OFF_ALLERGENS: Record<string, TagId> = {
  "en:milk": "dairy", "en:eggs": "egg", "en:fish": "fish", "en:crustaceans": "shellfish", "en:molluscs": "mollusc",
  "en:nuts": "tree_nuts", "en:peanuts": "peanuts", "en:gluten": "gluten", "en:soybeans": "soy", "en:sesame-seeds": "sesame",
  "en:mustard": "mustard", "en:celery": "celery", "en:sulphur-dioxide-and-sulphites": "sulfites",
};

/** Per-field plausibility ceilings. A value beyond these is a data-entry error, so it is dropped rather than shown. */
const CEILING: Record<Exclude<keyof Nutrients, "per">, { serving: number; per100g: number }> = {
  sodiumMg: { serving: 6000, per100g: 40000 },
  potassiumMg: { serving: 6000, per100g: 20000 },
  sugarG: { serving: 250, per100g: 100 },
  addedSugarG: { serving: 250, per100g: 100 },
  satFatG: { serving: 150, per100g: 100 },
  carbsG: { serving: 400, per100g: 100 },
  proteinG: { serving: 250, per100g: 100 },
  fiberG: { serving: 150, per100g: 100 },
  kcal: { serving: 4000, per100g: 900 },
};

/** Drop missing, negative, non-finite and implausible values. Returns undefined when nothing usable is left. */
export function sanitiseNutrients(n: Partial<Record<keyof Nutrients, unknown>> | undefined, per: "serving" | "100g"): Nutrients | undefined {
  if (!n) return undefined;
  const out: Nutrients = { per };
  let any = false;
  for (const key of Object.keys(CEILING) as (keyof typeof CEILING)[]) {
    const val = n[key];
    if (typeof val !== "number" || !Number.isFinite(val) || val < 0) continue;
    if (val > (per === "serving" ? CEILING[key].serving : CEILING[key].per100g)) continue;
    out[key] = Math.round(val * 10) / 10;
    any = true;
  }
  return any ? out : undefined;
}

/** "Water, vegetable oil (corn, canola), salt." -> ["Water", "vegetable oil", "corn", "canola", "salt"]. */
export function splitIngredients(text: string): string[] {
  const flat = text
    .replace(/\b(ingredients?|contains? (?:2|two)% or less of(?: the following)?|less than 2% of)\s*:?/gi, ",")
    .replace(/[()\[\]{}]/g, ",")
    .replace(/\band\/or\b/gi, ",");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of flat.split(/[,;]|\.(?:\s|$)/)) {
    const name = raw.replace(/\d+(\.\d+)?\s*%/g, "").replace(/^\s*(and|or)\s+/i, "").replace(/[*†‡]/g, "").trim();
    if (name.length < 2 || name.length > 80) continue;
    const key = normalise(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** An Open Food Facts API v2 product response -> facts. null when the product is unknown or has nothing usable. */
export function fromOpenFoodFacts(json: unknown): ProductFacts | null {
  const root = json as { status?: number; product?: Record<string, unknown> } | null;
  const p = root?.product;
  if (!root || root.status !== 1 || !p) return null;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const n = (p.nutriments ?? {}) as Record<string, unknown>;
  const num = (k: string) => (typeof n[k] === "number" ? (n[k] as number) : undefined);
  const g2mg = (v: number | undefined) => (v === undefined ? undefined : v * 1000);
  const pick = (suffix: "_serving" | "_100g") => ({
    sodiumMg: g2mg(num(`sodium${suffix}`)),
    potassiumMg: g2mg(num(`potassium${suffix}`)),
    sugarG: num(`sugars${suffix}`),
    addedSugarG: num(`added-sugars${suffix}`),
    satFatG: num(`saturated-fat${suffix}`),
    carbsG: num(`carbohydrates${suffix}`),
    proteinG: num(`proteins${suffix}`),
    fiberG: num(`fiber${suffix}`),
    kcal: num(`energy-kcal${suffix}`),
  });
  const nutrients = sanitiseNutrients(pick("_serving"), "serving") ?? sanitiseNutrients(pick("_100g"), "100g");
  const mapTags = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map((t) => OFF_ALLERGENS[String(t)]).filter(Boolean))] : []);
  const ingredientsText = str(p.ingredients_text_en) ?? str(p.ingredients_text);
  const name = str(p.product_name) ?? "";
  if (!name && !ingredientsText && !nutrients) return null;
  return {
    source: "database",
    name: name || "Unnamed product",
    ...(str(p.brands) ? { brand: str(p.brands) } : {}),
    ...(ingredientsText ? { ingredientsText } : {}),
    ...(nutrients ? { nutrients } : {}),
    declaredAllergens: mapTags(p.allergens_tags),
    traceAllergens: mapTags(p.traces_tags),
  };
}

/** Combine a label reading with a database record. Field by field, the label wins when it has the field. */
export function mergeFacts(label: ProductFacts | null, database: ProductFacts | null): ProductFacts | null {
  if (!label) return database;
  if (!database) return label;
  const labelHasList = !!label.ingredientsText?.trim();
  return {
    source: "label",
    name: label.name.trim() || database.name,
    ...(label.brand ?? database.brand ? { brand: label.brand ?? database.brand } : {}),
    ...(label.panel ? { panel: label.panel } : {}),
    ...(label.incomplete ? { incomplete: true } : {}),
    ...(label.actives?.length ? { actives: label.actives } : {}),
    ...(labelHasList ? { ingredientsText: label.ingredientsText } : database.ingredientsText ? { ingredientsText: database.ingredientsText } : {}),
    ...(label.contains ? { contains: label.contains } : {}),
    ...(label.mayContain ? { mayContain: label.mayContain } : {}),
    ...(label.nutrients ?? database.nutrients ? { nutrients: label.nutrients ?? database.nutrients } : {}),
    // Database allergen declarations only add caution, so they are kept alongside a label reading.
    declaredAllergens: database.declaredAllergens ?? [],
    traceAllergens: database.traceAllergens ?? [],
  };
}

export type ModelTag = { tag: string; sureness: Sureness; evidence: string };

/**
 * Build the Item for a product.
 * - Every ingredient carries the origin of the facts (label or database), so "nothing found" can be believed.
 * - Tags come from code first: literal ingredient names, the "Contains" statement and database declarations are
 *   certain; "may contain" statements and database traces are unsure.
 * - A model's extra tags (for derived ingredients such as "sodium caseinate") are kept only if their evidence is in
 *   the ingredient text, and are marked inferred so the evaluator asks rather than blocks.
 */
export function itemFromProduct(facts: ProductFacts, modelTags: ModelTag[] = [], id = "p1"): Item {
  const origin = facts.source;
  const activeNames = (facts.actives ?? []).map((a) => a.name.trim()).filter(Boolean);
  const names = [...activeNames, ...(facts.ingredientsText ? splitIngredients(facts.ingredientsText) : [])].filter(
    (n, i, all) => all.findIndex((m) => normalise(m) === normalise(n)) === i,
  );
  const ingredients = names.map((name) => ({ name, origin }));
  const tags = new Map<string, ItemTag>();
  const add = (t: ItemTag) => {
    const cur = tags.get(t.tag);
    const rank = { certain: 3, likely: 2, unsure: 1 } as const;
    // A firmer reading replaces a weaker one; a recorded one replaces an inferred one at the same firmness.
    if (!cur || rank[t.sureness] > rank[cur.sureness] || (rank[t.sureness] === rank[cur.sureness] && cur.origin === "inferred" && t.origin !== "inferred")) tags.set(t.tag, t);
  };
  for (const name of names) for (const hit of literalTags(name)) add({ tag: hit.tag, sureness: "certain", origin, evidence: name });
  // Supplement tags only on the ACTIVE ingredients of supplements and medicines. Calcium in a glass of milk is not a
  // calcium supplement, and neither is the magnesium stearate or iron oxide that holds a tablet together.
  if (facts.panel === "supplement" || facts.panel === "otc") {
    for (const name of activeNames) for (const hit of supplementTags(name)) add({ tag: hit.tag, sureness: "certain", origin, evidence: name });
  }
  if (facts.contains) for (const hit of literalTags(facts.contains)) add({ tag: hit.tag, sureness: "certain", origin, evidence: facts.contains });
  if (facts.mayContain) for (const hit of literalTags(facts.mayContain)) add({ tag: hit.tag, sureness: "unsure", origin, evidence: facts.mayContain });
  for (const tag of facts.declaredAllergens ?? []) add({ tag, sureness: "certain", origin: "database", evidence: "listed as an allergen in the product database" });
  for (const tag of facts.traceAllergens ?? []) add({ tag, sureness: "unsure", origin: "database", evidence: "listed as a possible trace in the product database" });
  const text = normalise(`${facts.ingredientsText ?? ""} ${facts.contains ?? ""} ${facts.mayContain ?? ""}`);
  for (const t of modelTags) {
    if (!isKnownTag(t.tag) || tagInfo(t.tag)?.group === "nutrient") continue;
    if (!t.evidence.trim() || !containsTerm(text, t.evidence)) continue; // no evidence, no tag
    add({ tag: t.tag, sureness: t.sureness === "certain" ? "likely" : t.sureness, origin: "inferred", evidence: t.evidence.trim() });
  }
  return {
    id,
    kind: facts.panel === "supplement" ? "supplement" : facts.panel === "otc" ? "otc" : "product",
    name: facts.brand && !facts.name.toLowerCase().includes(facts.brand.toLowerCase()) ? `${facts.brand} ${facts.name}` : facts.name,
    ingredients,
    tags: [...tags.values()],
    ...(facts.nutrients ? { nutrients: facts.nutrients } : {}),
    ...(facts.incomplete ? { incomplete: true } : {}),
  };
}

/** Is there enough here to say anything about the product? */
export function hasSubstance(facts: ProductFacts | null): boolean {
  return !!facts && (!!facts.ingredientsText?.trim() || !!facts.nutrients || !!facts.contains?.trim() || !!facts.actives?.length);
}
