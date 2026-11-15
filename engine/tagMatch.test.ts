import { describe, expect, it } from "vitest";
import { codeCheck, containsTerm, hidesInTags, literalTags, normalise } from "./tagMatch";
import { isKnownTag, tagSatisfies, withImplied } from "./tags";
import synonyms from "../data/synonyms.json";
import hidesIn from "../data/hidesIn.json";
import allergies from "../data/rules/allergies.json";
import diets from "../data/rules/diets.json";
import conditions from "../data/rules/conditions.json";
import type { Item } from "./types";

const tagsOf = (text: string) => literalTags(text).map((t) => t.tag);
const dish = (name: string, description = "", ingredients: Item["ingredients"] = []): Item => ({
  id: "x", kind: "dish", name, description, ingredients, tags: [],
});

describe("normalise and containsTerm", () => {
  it("strips accents, case and punctuation", () => {
    expect(normalise("Crème Brûlée!")).toBe("creme brulee");
  });
  it("treats curly and straight apostrophes alike", () => {
    expect(normalise("St. John\u2019s Wort")).toBe("st john's wort");
  });
  it("matches whole words only", () => {
    expect(containsTerm(normalise("coconut curry with nutmeg"), "nut")).toBe(false);
    expect(containsTerm(normalise("mixed nut crumble"), "nut")).toBe(true);
  });
});

describe("literalTags", () => {
  it("finds plain allergens", () => {
    expect(tagsOf("candied walnuts, goat cheese")).toEqual(expect.arrayContaining(["tree_nuts", "dairy"]));
  });
  it("does not call plant milks dairy, but does call almond milk a tree nut", () => {
    expect(tagsOf("almond milk latte")).toContain("tree_nuts");
    expect(tagsOf("almond milk latte")).not.toContain("dairy");
    expect(tagsOf("coconut milk curry")).not.toContain("dairy");
  });
  it("does not call peanut butter or cocoa butter dairy", () => {
    expect(tagsOf("peanut butter toast")).toContain("peanuts");
    expect(tagsOf("peanut butter toast")).not.toContain("dairy");
    expect(tagsOf("cocoa butter")).not.toContain("dairy");
    expect(tagsOf("butter chicken")).toContain("dairy");
  });
  it("still finds dairy when an excluded phrase sits beside a real one", () => {
    expect(tagsOf("coconut milk and whole milk")).toContain("dairy");
  });
  it("keeps buckwheat, eggplant, hamburger and root beer out of the wrong tags", () => {
    expect(tagsOf("buckwheat pancakes")).not.toContain("wheat");
    expect(tagsOf("grilled eggplant")).not.toContain("egg");
    expect(tagsOf("hamburger")).not.toContain("pork");
    expect(tagsOf("hamburger")).toContain("beef");
    expect(tagsOf("root beer float")).not.toContain("alcohol");
  });
  it("does not read 'gluten-free' as gluten", () => {
    expect(tagsOf("gluten-free brownie")).not.toContain("gluten");
  });
  it("finds grapefruit and alcohol in a cocktail description", () => {
    expect(tagsOf("tequila, grapefruit soda, lime")).toEqual(expect.arrayContaining(["grapefruit", "alcohol"]));
  });
});

describe("hidesInTags", () => {
  it("flags pesto for tree nuts and pad thai for peanuts", () => {
    expect(hidesInTags("basil pesto pasta").map((t) => t.tag)).toContain("tree_nuts");
    expect(hidesInTags("Pad Thai").map((t) => t.tag)).toContain("peanuts");
  });
  it("flags a paloma for grapefruit even when the menu does not say so", () => {
    expect(hidesInTags("Paloma").map((t) => t.tag)).toContain("grapefruit");
  });
});

describe("implied tags", () => {
  it("treats pork as meat and wheat as gluten", () => {
    expect(withImplied("pork")).toContain("meat");
    expect(tagSatisfies("wheat", "gluten")).toBe(true);
    expect(tagSatisfies("meat", "pork")).toBe(false);
  });
});

describe("codeCheck", () => {
  it("is a match when the dish names the ingredient", () => {
    expect(codeCheck(dish("Walnut and beet salad"), "tree_nuts").result).toBe("match");
  });
  it("is hides_in when the dish names something that commonly contains it", () => {
    expect(codeCheck(dish("Pesto pasta", "basil pesto, parmesan"), "tree_nuts").result).toBe("hides_in");
  });
  it("is no_match otherwise", () => {
    expect(codeCheck(dish("Grilled salmon", "with lemon and rice"), "tree_nuts").result).toBe("no_match");
  });
  it("matches a rule on meat when the dish names bacon", () => {
    expect(codeCheck(dish("BLT", "bacon, lettuce, tomato"), "meat").result).toBe("match");
  });
  it("ignores inferred ingredients: a guess is not the item's own words", () => {
    const d = dish("House salad", "", [{ name: "walnuts", origin: "inferred" }]);
    expect(codeCheck(d, "tree_nuts").result).toBe("no_match");
  });
  it("reads stated ingredients", () => {
    const d = dish("Granola bar", "", [{ name: "almonds", origin: "label" }]);
    expect(codeCheck(d, "tree_nuts").result).toBe("match");
  });
});

describe("data files", () => {
  it("only use tags from the tag list", () => {
    for (const t of Object.keys(synonyms.synonyms)) expect(isKnownTag(t), `synonyms: ${t}`).toBe(true);
    for (const t of Object.keys(hidesIn.hidesIn)) expect(isKnownTag(t), `hidesIn: ${t}`).toBe(true);
    for (const r of allergies.rules) expect(isKnownTag(r.tag), `allergies: ${r.tag}`).toBe(true);
    for (const d of Object.values(diets.diets)) for (const t of d.never) expect(isKnownTag(t), `diets: ${t}`).toBe(true);
  });
  it("give every condition rule a known tag, a source url and a quote", () => {
    for (const [key, c] of Object.entries(conditions.conditions)) {
      expect(c.source.url, key).toMatch(/^https:\/\//);
      for (const r of c.rules) {
        expect(isKnownTag(r.tag), `${key}: ${r.tag}`).toBe(true);
        expect(r.quote.length, `${key}: ${r.tag}`).toBeGreaterThan(10);
      }
    }
  });
  it("keep every term lowercase and already normalised", () => {
    for (const entries of Object.values(synonyms.synonyms)) for (const e of entries) expect(normalise(e.term)).toBe(e.term.replace(/-/g, " "));
  });
});
