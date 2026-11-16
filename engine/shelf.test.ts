import { describe, expect, it } from "vitest";
import menu from "../bench/data/menu-lines.json";
import sample from "../bench/data/shelf-lines.json";
import type { TextLine } from "./memory";
import type { ProductFacts } from "./product";
import { blockSignature, frontHints, frontsToAsk, looksLikeShelf, matchProduct, packageFronts, packageOutlines, searchTerms, shelfVerdict, textBlocks, type KnownProduct } from "./shelf";
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
  it("calls a product a good fit once the careful reading finds nothing, and still says what to check on the package", () => {
    const v = shelfVerdict(soup, [NUTS], { modelTags: [], opinions: [{ itemId: "p1", tag: "tree_nuts", answer: "no" }] });
    expect(v.state).toBe("good");
    expect(v.checking).toBeUndefined();
    expect(v.reason).toMatch(/confirm no tree nuts/i);
  });
  it("does not call it good on code's reading alone: until the careful reading is in, it is only unflagged", () => {
    expect(shelfVerdict(soup, [NUTS], null)).toEqual({ state: "unflagged", checking: true });
  });
  it("is plainly good, with nothing to confirm, when no hard rule is in play", () => {
    expect(shelfVerdict(soup, [], { modelTags: [], opinions: [] })).toEqual({ state: "good" });
  });
  it("turns to a question when the careful reading is unsure", () => {
    expect(shelfVerdict(soup, [NUTS], { modelTags: [], opinions: [{ itemId: "p1", tag: "tree_nuts", answer: "maybe" }] }).state).toBe("cant_tell");
  });
  it("gives a package the same signature however its words were ordered or cased", () => {
    expect(blockSignature("HEINZ Classic Chicken")).toBe(blockSignature("chicken heinz CLASSIC"));
    expect(searchTerms("HEINZ Classic Chicken & Sweet Corn 400g")).toEqual(["classic", "chicken", "heinz", "sweet"]);
  });
});

const obj = (left: number, top: number, right: number, bottom: number, score = 0.8) => ({ box: { left, top, right, bottom }, score });

describe("packageOutlines", () => {
  it("keeps one outline for a package outlined twice, the surer one", () => {
    const out = packageOutlines([obj(0.1, 0.1, 0.3, 0.5, 0.6), obj(0.11, 0.1, 0.3, 0.5, 0.9)]);
    expect(out).toHaveLength(1);
    expect(out[0].left).toBeCloseTo(0.11);
  });
  it("drops an outline around a whole row, and one around most of the picture", () => {
    const out = packageOutlines([obj(0.1, 0.1, 0.2, 0.3), obj(0.22, 0.1, 0.32, 0.3), obj(0.34, 0.1, 0.44, 0.3), obj(0.09, 0.09, 0.45, 0.31, 0.95), obj(0, 0, 1, 0.9, 0.99)]);
    expect(out).toHaveLength(3);
  });
  it("drops an outline inside a package (its lid), and specks", () => {
    const out = packageOutlines([obj(0.1, 0.1, 0.3, 0.6), obj(0.15, 0.1, 0.25, 0.16, 0.9), obj(0.5, 0.5, 0.505, 0.505)]);
    expect(out).toEqual([{ left: 0.1, top: 0.1, right: 0.3, bottom: 0.6 }]);
  });
});

describe("packageFronts", () => {
  it("gives each outlined package its own words, even a single line, and keeps a package with no print", () => {
    const fronts = packageFronts([line("HEINZ", 0.12, 0.2), line("Minestrone", 0.12, 0.23), line("Tuna", 0.42, 0.2)], [{ left: 0.1, top: 0.1, right: 0.3, bottom: 0.5 }, { left: 0.4, top: 0.1, right: 0.6, bottom: 0.5 }, { left: 0.7, top: 0.1, right: 0.9, bottom: 0.5 }]);
    expect(fronts.map((f) => [f.text, f.outline])).toEqual([["HEINZ Minestrone", "object"], ["Tuna", "object"], ["", "object"]]);
    expect(fronts[0].box.right).toBeCloseTo(0.3);
  });
  it("still finds a package the detector missed from its print, and is textBlocks when nothing is outlined", () => {
    const lines = [line("HEINZ", 0.12, 0.2), line("Minestrone", 0.12, 0.225), line("Country", 0.62, 0.2), line("Ladle", 0.62, 0.225)];
    const fronts = packageFronts(lines, [{ left: 0.1, top: 0.1, right: 0.3, bottom: 0.5 }]);
    expect(fronts.map((f) => [f.text, f.outline])).toEqual([["HEINZ Minestrone", "object"], ["Country Ladle", "text"]]);
    expect(packageFronts(lines, []).map((f) => f.text)).toEqual(textBlocks(lines).map((b) => b.text));
  });
  it("gives words inside nested outlines to the smaller one", () => {
    const fronts = packageFronts([line("Oat Drink", 0.22, 0.3)], [{ left: 0.1, top: 0.1, right: 0.6, bottom: 0.6 }, { left: 0.2, top: 0.2, right: 0.35, bottom: 0.55 }]);
    expect(fronts.find((f) => f.text === "Oat Drink")!.box.left).toBeCloseTo(0.2);
  });
});

describe("looksLikeShelf", () => {
  it("knows a real shelf of tins for a shelf", () => {
    expect(looksLikeShelf(textBlocks(sample.lines as TextLine[]), 0)).toBe(true);
  });
  it("does not take a real restaurant menu for one", () => {
    expect(looksLikeShelf(textBlocks(menu.lines as TextLine[]), 0)).toBe(false);
  });
  it("does not take a couple of stray blocks of text for one", () => {
    expect(looksLikeShelf(textBlocks([line("Fresh", 0.1, 0.3), line("Bread", 0.1, 0.325), line("Open", 0.6, 0.7), line("Daily", 0.6, 0.725)]), 0)).toBe(false);
    expect(looksLikeShelf([], 0)).toBe(false);
  });
  it("marks a single package when it is one the app knows", () => {
    expect(looksLikeShelf(textBlocks([line("HEINZ", 0.4, 0.4), line("Classic", 0.4, 0.425)]), 1)).toBe(true);
  });
});

describe("frontHints", () => {
  const rule = (tag: string): Rule => ({ id: tag, level: "never", tag, reason: "t", source: { title: "t", url: "u" }, from: { type: "allergy", label: `${tag} allergy` }, status: "library", enabled: true });
  it("flags a front whose own words name the thing, and says nothing about one with nothing against it", () => {
    const [nutty, cola] = frontHints(["Silk Almond milk unsweetened", "Coca-Cola Original Taste"], [rule("tree_nuts")]);
    expect(nutty?.state).toBe("not_fit");
    expect(cola).toBeNull();
  });
  it("flags a front the judge thinks likely, and ignores a judge that is only unsure", () => {
    const fronts = ["Snickers", "Lays Classic potato chips"];
    expect(frontHints(fronts, [rule("peanuts")])).toEqual([null, null]);
    const hints = frontHints(fronts, [rule("peanuts")], [{ itemId: "l1", ruleId: "peanuts", p: 0.96 }, { itemId: "l2", ruleId: "peanuts", p: 0.3 }]);
    expect(hints[0]).toEqual({ state: "not_fit", reason: "Likely contains peanuts." });
    expect(hints[1]).toBeNull();
  });
  it("has nothing to say when no hard rule is in play", () => {
    expect(frontHints(["Skippy Creamy Peanut Butter"], [])).toEqual([null]);
  });
});

describe("frontsToAsk", () => {
  const at = (left: number, size: number) => ({ top: 0.1, left, bottom: 0.1 + size, right: left + size });

  it("asks once about a row of the same product, and skips packages with nothing read off them", () => {
    const asked = frontsToAsk(
      [
        { text: "Skippy Creamy Peanut Butter", box: at(0.1, 0.1) },
        { text: "", box: at(0.3, 0.1) },
        { text: "peanut butter SKIPPY creamy", box: at(0.5, 0.1) },
        { text: "Coca-Cola Original Taste", box: at(0.7, 0.1) },
      ],
      10,
    );
    expect(asked).toEqual([
      { text: "Skippy Creamy Peanut Butter", at: [0, 2] },
      { text: "Coca-Cola Original Taste", at: [3] },
    ]);
  });

  it("keeps the nearest packages when there are more than can be asked about", () => {
    const asked = frontsToAsk(
      [
        { text: "Far Away Crackers", box: at(0.1, 0.05) },
        { text: "Right Here Granola", box: at(0.3, 0.3) },
        { text: "Middle Shelf Soup", box: at(0.7, 0.15) },
      ],
      2,
    );
    expect(asked.map((a) => a.at)).toEqual([[1], [2]]);
  });
});
