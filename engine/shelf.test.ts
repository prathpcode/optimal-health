import { describe, expect, it } from "vitest";
import sample from "../bench/data/shelf-lines.json";
import type { TextLine } from "./memory";
import type { ProductFacts } from "./product";
import { blockSignature, matchProduct, searchTerms, shelfVerdict, textBlocks, type KnownProduct } from "./shelf";
import type { Rule } from "./types";

const KNOWN: KnownProduct[] = [
  { key: "a", brand: "Campbell's", name: "Country Ladle Chicken & Pasta" },
  { key: "b", brand: "Campbell's", name: "Country Ladle Chicken & Sweet Corn" },
  { key: "c", brand: "Campbell's", name: "Country Ladle Minestrone" },
  { key: "d", brand: "Heinz", name: "Classic Chicken & Sweet Corn" },
  { key: "e", brand: "Heinz", name: "Classic Country Chicken" },
  { key: "f", brand: "Heinz", name: "Classic Italian Minestrone" },
];
const line = (text: string, left: number, top: number, w = 0.08, h = 0.02): TextLine => ({ text, box: { left, top, right: left + w, bottom: top + h } });

describe("textBlocks", () => {
  it("groups the lines stacked on one package, and keeps the package beside it apart", () => {
    const blocks = textBlocks([line("HEINZ", 0.1, 0.5), line("Classic", 0.1, 0.525), line("Chicken &", 0.1, 0.55), line("HEINZ", 0.22, 0.5), line("Italian", 0.22, 0.525)]);
    expect(blocks.map((b) => b.text)).toEqual(["HEINZ Classic Chicken &", "HEINZ Italian"]);
    expect(blocks[0].box.top).toBeCloseTo(0.5);
    expect(blocks[0].box.bottom).toBeCloseTo(0.57);
    expect(blocks[0].box.right).toBeCloseTo(0.18);
  });
  it("does not join a tin to the price tag's small print under it, or keep a lone word", () => {
    const blocks = textBlocks([line("Country", 0.1, 0.3, 0.1, 0.03), line("Ladle", 0.1, 0.335, 0.1, 0.03), line("per 100g", 0.12, 0.37, 0.05, 0.006), line("Farm Picked Produce", 0.4, 0.6, 0.2, 0.02)]);
    expect(blocks.map((b) => b.text)).toEqual(["Country Ladle"]);
  });
  it("ignores a line that runs two packages' words together", () => {
    const blocks = textBlocks([line("Ladle", 0.1, 0.3), line("Chicken", 0.1, 0.325), line("Country Country", 0.1, 0.275, 0.2), line("Ladle", 0.22, 0.3), line("Minestrone", 0.22, 0.325)]);
    expect(blocks).toHaveLength(2);
  });
  it("finds dozens of separate packages on a real shelf photo", () => {
    const blocks = textBlocks(sample.lines as TextLine[]);
    expect(blocks.length).toBeGreaterThan(30);
    // No block swallows a big part of the shelf.
    for (const b of blocks) expect(b.box.right - b.box.left, b.text).toBeLessThan(0.25);
  });
});

describe("matchProduct", () => {
  it("names a package from its words, as they were really misread on a shelf", () => {
    expect(matchProduct("Campbells Country Ladle Chicken Pasta", KNOWN)?.key).toBe("a");
    expect(matchProduct("Campbel Country Ladle Chicken Past with winter se", KNOWN)?.key).toBe("a");
    expect(matchProduct("Camphil Country Ladle Chicken and sweet car", KNOWN)?.key).toBe("b");
    expect(matchProduct("HEINZ Classic Chicken & Sweet Corn", KNOWN)?.key).toBe("d");
    expect(matchProduct("HEIN Itallian Minest", KNOWN)?.key).toBe("f");
    expect(matchProduct("Comphl Countle Ladle Minestra", KNOWN)?.key).toBe("c");
  });
  it("chooses nothing when the word that tells two varieties apart could not be read", () => {
    expect(matchProduct("Camph Country Ladle Chicken", KNOWN)).toBeNull();
  });
  it("does not take a tin for the one variety it knows, just because the brand's words match", () => {
    const only = [{ key: "m", brand: "Campbell's Country Ladle", name: "Minestrone" }, { key: "s", brand: "Heinz", name: "Classic Chicken & Sweetcorn soup" }];
    expect(matchProduct("Campbells Country Ladle Chicken Pasta", only)).toBeNull();
    expect(matchProduct("Campbell Country Ladle Minestrone", only)?.key).toBe("m");
    expect(matchProduct("HEINZ Classic Country Chicken", only)).toBeNull();
    expect(matchProduct("HEINZ Classic Chicken & Sweet Corn", only)?.key).toBe("s");
  });
  it("chooses nothing for a shelf label or a product it has never seen", () => {
    expect(matchProduct("Farm Picked Produce", KNOWN)).toBeNull();
    expect(matchProduct("Kellogg's Corn Flakes cereal", KNOWN)).toBeNull();
  });
  it("names most packages on the real shelf, and none of them wrongly across brands", () => {
    const blocks = textBlocks(sample.lines as TextLine[]);
    const named = blocks.map((b) => ({ b, p: matchProduct(b.text, KNOWN) })).filter((x) => x.p);
    expect(named.length).toBeGreaterThan(15);
    for (const { b, p } of named) {
      const heinz = /hein|einz/i.test(b.text);
      expect(p!.brand === "Heinz", b.text).toBe(heinz);
    }
  });
});

describe("shelfVerdict", () => {
  const NUTS: Rule = { id: "nuts", level: "never", tag: "tree_nuts", reason: "t", source: { title: "t", url: "u" }, from: { type: "allergy", label: "tree nut allergy" }, status: "library", enabled: true };
  const bar: ProductFacts = { source: "database", name: "Almond Crunch Bar", brand: "Nutty", ingredientsText: "oats, almonds, honey" };
  const soup: ProductFacts = { source: "database", name: "Chicken & Sweet Corn Soup", brand: "Heinz", ingredientsText: "water, sweet corn, chicken, salt" };
  it("flags a product whose ingredients name the allergen, and says why", () => {
    expect(shelfVerdict(bar, [NUTS], null)).toMatchObject({ state: "not_fit", checking: true });
    expect(shelfVerdict(bar, [NUTS], null).reason).toMatch(/tree nuts/i);
  });
  it("never calls a product fine: with nothing against it, it is only unflagged", () => {
    expect(shelfVerdict(soup, [NUTS], { modelTags: [], opinions: [{ itemId: "p1", tag: "tree_nuts", answer: "no" }] })).toEqual({ state: "unflagged" });
  });
  it("is marked as still being checked until the models' reading is known", () => {
    expect(shelfVerdict(soup, [NUTS], null)).toEqual({ state: "unflagged", checking: true });
  });
  it("turns to a question when the careful reading is unsure", () => {
    expect(shelfVerdict(soup, [NUTS], { modelTags: [], opinions: [{ itemId: "p1", tag: "tree_nuts", answer: "maybe" }] }).state).toBe("cant_tell");
  });
  it("gives a package the same signature however its words were ordered or cased", () => {
    expect(blockSignature("HEINZ Classic Chicken")).toBe(blockSignature("chicken heinz CLASSIC"));
    expect(searchTerms("HEINZ Classic Chicken & Sweet Corn 400g")).toEqual(["classic", "chicken", "heinz", "sweet"]);
  });
});
