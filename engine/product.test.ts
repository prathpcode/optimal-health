import { describe, expect, it } from "vitest";
import { evaluate } from "./evaluate";
import { fromOpenFoodFacts, hasSubstance, itemFromProduct, mergeFacts, sanitiseNutrients, splitIngredients, type ProductFacts } from "./product";
import type { Rule } from "./types";

const rule = (id: string, level: Rule["level"], tag: string, budget?: Rule["budget"]): Rule => ({
  id, level, tag, ...(budget ? { budget } : {}), reason: "t", source: { title: "t", url: "u" }, from: { type: "user", label: "t" }, status: "unverified", enabled: true,
});
const SOUP = {
  status: 1,
  product: {
    product_name: "Cream Of Mushroom Soup",
    brands: "Campbell's",
    ingredients_text: "Water, mushrooms, vegetable oil (corn, canola, soybean), modified cornstarch, wheat flour, salt, cream, whey, soy protein concentrate, monosodium glutamate, yeast extract, dried garlic, natural flavoring.",
    allergens_tags: ["en:gluten", "en:milk", "en:soybeans"],
    traces_tags: [],
    nutriments: { sodium_serving: 0.86, sodium_100g: 0.7166, sugars_serving: 1, "saturated-fat_serving": 1, carbohydrates_serving: 8, proteins_serving: 2, fiber_serving: 0, "energy-kcal_serving": 100, potassium_serving: 0.05 },
  },
};

describe("splitIngredients", () => {
  it("flattens brackets and drops percentages and boilerplate", () => {
    expect(splitIngredients("Ingredients: Water, vegetable oil (corn, canola), contains 2% or less of: salt, sugar 3%, and natural flavor.")).toEqual([
      "Water", "vegetable oil", "corn", "canola", "salt", "sugar", "natural flavor",
    ]);
  });
  it("removes duplicates regardless of case", () => {
    expect(splitIngredients("Salt, SALT, salt.")).toEqual(["Salt"]);
  });
});

describe("sanitiseNutrients", () => {
  it("drops impossible values and keeps the rest", () => {
    expect(sanitiseNutrients({ sodiumMg: 860, sugarG: -1, kcal: 99999, satFatG: Number.NaN }, "serving")).toEqual({ per: "serving", sodiumMg: 860 });
  });
  it("returns undefined when nothing usable is left", () => {
    expect(sanitiseNutrients({ sodiumMg: 999999 }, "serving")).toBeUndefined();
    expect(sanitiseNutrients(undefined, "serving")).toBeUndefined();
  });
});

describe("fromOpenFoodFacts", () => {
  it("reads a product, converting sodium from grams to milligrams per serving", () => {
    const f = fromOpenFoodFacts(SOUP)!;
    expect(f).toMatchObject({ source: "database", name: "Cream Of Mushroom Soup", brand: "Campbell's", declaredAllergens: ["gluten", "dairy", "soy"] });
    expect(f.nutrients).toMatchObject({ per: "serving", sodiumMg: 860, potassiumMg: 50, kcal: 100 });
  });
  it("falls back to per-100 g numbers when there are none per serving", () => {
    const f = fromOpenFoodFacts({ status: 1, product: { product_name: "X", nutriments: { sodium_100g: 0.5 } } })!;
    expect(f.nutrients).toEqual({ per: "100g", sodiumMg: 500 });
  });
  it("drops a wildly wrong figure instead of reporting it", () => {
    const f = fromOpenFoodFacts({ status: 1, product: { product_name: "X", ingredients_text: "sugar", nutriments: { sodium_serving: 86 } } })!;
    expect(f.nutrients).toBeUndefined();
  });
  it("returns null for an unknown barcode", () => {
    expect(fromOpenFoodFacts({ status: 0 })).toBeNull();
    expect(fromOpenFoodFacts(null)).toBeNull();
  });
});

describe("itemFromProduct", () => {
  const item = itemFromProduct(fromOpenFoodFacts(SOUP)!);
  const tagOf = (t: string) => item.tags.find((x) => x.tag === t);
  it("tags from the ingredient list and the database declaration, as recorded facts", () => {
    expect(item.name).toBe("Campbell's Cream Of Mushroom Soup");
    expect(tagOf("dairy")).toMatchObject({ sureness: "certain", origin: "database" });
    expect(tagOf("wheat")).toMatchObject({ sureness: "certain", evidence: "wheat flour" });
    expect(tagOf("soy")?.sureness).toBe("certain");
    expect(tagOf("onion_garlic")?.evidence).toBe("dried garlic");
    expect(item.ingredients.every((i) => i.origin === "database")).toBe(true);
  });
  it("blocks a dairy allergy and reports sodium against the limit", () => {
    const rules = [rule("d", "never", "dairy"), rule("s", "limit", "sodium", { nutrient: "sodiumMg", amount: 2300, unit: "mg", per: "day" })];
    const v = evaluate(item, rules);
    expect(v.fit).toBe("not_fit");
    expect(v.findings.map((f) => f.ruleId)).toEqual(["d", "s"]);
    expect(v.findings[1].because).toContain("860 mg");
    expect(v.findings[1].because).toContain("37% of your daily limit");
  });
  it("does not let a database record alone clear an allergy: it says to check the package", () => {
    const v = evaluate(item, [rule("n", "never", "tree_nuts")]);
    expect(v.findings).toHaveLength(1);
    expect(v.findings[0]).toMatchObject({ outcome: "confirm" });
    expect(v.findings[0].because).toContain("database");
    // The same facts read off the package itself are believed.
    const fromLabel = itemFromProduct({ ...fromOpenFoodFacts(SOUP)!, source: "label", declaredAllergens: [], traceAllergens: [] });
    expect(evaluate(fromLabel, [rule("n", "never", "tree_nuts")]).findings).toEqual([]);
  });
  it("does not believe 'nothing found' on a label that could not be read in full", () => {
    const partial = itemFromProduct({ source: "label", name: "Bar", ingredientsText: "Oats, honey", incomplete: true });
    expect(evaluate(partial, [rule("n", "never", "tree_nuts")]).findings[0]).toMatchObject({ outcome: "confirm" });
  });
  it("compares added sugars with the Daily Value, and does not judge a total-sugars figure against it", () => {
    const sugar = rule("su", "limit", "sugar");
    const milk = itemFromProduct({ source: "label", name: "Milk", ingredientsText: "Milk", nutrients: { per: "serving", sugarG: 12 } });
    const vm = evaluate(milk, [sugar]);
    expect(vm).toMatchObject({ fit: "good", score: 1 });
    expect(vm.findings[0].because).toContain("total sugars");
    const soda = itemFromProduct({ source: "label", name: "Soda", ingredientsText: "Water, sugar", nutrients: { per: "serving", sugarG: 39, addedSugarG: 39 } });
    const vs = evaluate(soda, [sugar]);
    expect(vs.fit).toBe("okay");
    expect(vs.findings[0].because).toContain("78% of the Daily Value");
  });
  it("treats 'may contain' as unsure, which blocks an allergy and is only a note for an Avoid rule", () => {
    const facts: ProductFacts = { source: "label", name: "Oat bar", ingredientsText: "Oats, honey", mayContain: "May contain peanuts and tree nuts." };
    const it2 = itemFromProduct(facts);
    expect(it2.tags.find((t) => t.tag === "peanuts")).toMatchObject({ sureness: "unsure", origin: "label" });
    expect(evaluate(it2, [rule("p", "never", "peanuts")]).fit).toBe("not_fit");
    expect(evaluate(it2, [rule("p", "avoid", "peanuts")]).fit).toBe("good");
  });
  it("keeps a model tag only when its evidence is in the ingredient text, and marks it inferred", () => {
    const facts: ProductFacts = { source: "label", name: "Creamer", ingredientsText: "Water, sodium caseinate, sugar" };
    const it3 = itemFromProduct(facts, [
      { tag: "dairy", sureness: "certain", evidence: "sodium caseinate" },
      { tag: "tree_nuts", sureness: "likely", evidence: "almond extract" },
      { tag: "bogus", sureness: "likely", evidence: "water" },
    ]);
    expect(it3.tags).toEqual([{ tag: "dairy", sureness: "likely", origin: "inferred", evidence: "sodium caseinate" }]);
  });
  it("does not let a model's weaker reading replace a recorded one", () => {
    const facts: ProductFacts = { source: "label", name: "Milk chocolate", ingredientsText: "Sugar, milk, cocoa butter" };
    const it4 = itemFromProduct(facts, [{ tag: "dairy", sureness: "unsure", evidence: "milk" }]);
    expect(it4.tags.find((t) => t.tag === "dairy")).toMatchObject({ sureness: "certain", origin: "label" });
  });
});

describe("mergeFacts", () => {
  const db = fromOpenFoodFacts(SOUP)!;
  it("lets the label win field by field and keeps the database's allergen declarations", () => {
    const label: ProductFacts = { source: "label", name: "", ingredientsText: "Water, mushrooms, cream", contains: "Contains: Milk.", nutrients: { per: "serving", sodiumMg: 790 } };
    const m = mergeFacts(label, db)!;
    expect(m).toMatchObject({ source: "label", name: "Cream Of Mushroom Soup", ingredientsText: "Water, mushrooms, cream", nutrients: { sodiumMg: 790 } });
    expect(m.declaredAllergens).toContain("gluten");
  });
  it("uses the database list when the label photo had none", () => {
    const m = mergeFacts({ source: "label", name: "Soup" }, db)!;
    expect(m.ingredientsText).toContain("mushrooms");
  });
  it("passes through when only one side exists", () => {
    expect(mergeFacts(null, db)).toBe(db);
    expect(mergeFacts(null, null)).toBeNull();
  });
});

describe("hasSubstance", () => {
  it("needs an ingredient list, a Contains statement or nutrition numbers", () => {
    expect(hasSubstance({ source: "label", name: "Front of pack only" })).toBe(false);
    expect(hasSubstance({ source: "label", name: "X", contains: "Contains: Milk" })).toBe(true);
    expect(hasSubstance(null)).toBe(false);
  });
});
