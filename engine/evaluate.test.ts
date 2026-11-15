import { describe, expect, it } from "vitest";
import { absenceIsTrusted, evaluate, withSecondOpinion } from "./evaluate";
import scanJson from "../fixtures/scan.done.json";
import profileJson from "../fixtures/profile.json";
import type { HardCheck, Item, ItemTag, Rule, ScanRecord } from "./types";

const rule = (over: Partial<Rule> & Pick<Rule, "id" | "level" | "tag">): Rule => ({
  reason: "test",
  source: { title: "test", url: "https://example.invalid" },
  from: { type: "user", label: "test" },
  status: "unverified",
  enabled: true,
  ...over,
});
const NUTS = rule({ id: "nuts", level: "never", tag: "tree_nuts" });
const GRAPEFRUIT = rule({ id: "gf", level: "avoid", tag: "grapefruit" });
const SODIUM = rule({ id: "na", level: "limit", tag: "sodium", budget: { nutrient: "sodiumMg", amount: 1500, unit: "mg", per: "day" } });
const GREENS = rule({ id: "vk", level: "keep_steady", tag: "leafy_greens_vitamin_k" });

const dish = (over: Partial<Item> = {}): Item => ({
  id: "d", kind: "dish", name: "Test dish", ingredients: [{ name: "something", origin: "menu_text" }], tags: [], ...over,
});
const product = (over: Partial<Item> = {}): Item => ({
  id: "p", kind: "product", name: "Test product", ingredients: [{ name: "oats", origin: "label" }], tags: [], ...over,
});
const tag = (t: string, over: Partial<ItemTag> = {}): ItemTag => ({ tag: t, sureness: "certain", origin: "menu_text", evidence: "x", ...over });
const check = (ruleId: string, over: Partial<HardCheck> = {}): HardCheck => ({ itemId: "d", ruleId, code: "no_match", judgeP: null, reader: null, ...over });
const outcomes = (v: ReturnType<typeof evaluate>) => v.findings.map((f) => f.outcome);

describe("hard rules on a menu dish", () => {
  it("blocks when the menu names the ingredient", () => {
    const v = evaluate(dish({ tags: [tag("tree_nuts", { evidence: "candied walnuts" })] }), [NUTS]);
    expect(v.fit).toBe("not_fit");
    expect(v.findings[0].because).toContain("candied walnuts");
  });
  it("blocks on a literal code match even with no tags", () => {
    expect(evaluate(dish(), [NUTS], [check("nuts", { code: "match" })]).fit).toBe("not_fit");
  });
  it("blocks when judge and reader both say yes", () => {
    expect(evaluate(dish(), [NUTS], [check("nuts", { judgeP: 0.9, reader: "yes" })]).fit).toBe("not_fit");
  });
  it("asks when the checks disagree", () => {
    const v = evaluate(dish(), [NUTS], [check("nuts", { judgeP: 0.9, reader: "no" })]);
    expect(v.fit).toBe("cant_tell");
    expect(v.findings[0].question).toBeTruthy();
  });
  it("asks when the dish is a known hiding place, even if both models say no", () => {
    expect(evaluate(dish(), [NUTS], [check("nuts", { code: "hides_in", judgeP: 0.02, reader: "no" })]).fit).toBe("cant_tell");
  });
  it("asks when the judge is in the middle band", () => {
    expect(evaluate(dish(), [NUTS], [check("nuts", { judgeP: 0.3, reader: "no" })]).fit).toBe("cant_tell");
  });
  it("never clears a Never rule on an inferred item: all-clear checks still produce 'confirm'", () => {
    const v = evaluate(dish(), [NUTS], [check("nuts", { judgeP: 0.01, reader: "no" })]);
    expect(v.fit).toBe("good");
    expect(outcomes(v)).toEqual(["confirm"]);
    expect(v.findings[0].question).toContain("tree nuts");
  });
  it("still produces 'confirm' when no check ran at all", () => {
    expect(outcomes(evaluate(dish(), [NUTS], []))).toEqual(["confirm"]);
  });
  it("judge has no opinion: decides on code and reader alone and still cannot fully clear", () => {
    expect(outcomes(evaluate(dish(), [NUTS], [check("nuts", { judgeP: null, reader: "no" })]))).toEqual(["confirm"]);
    expect(evaluate(dish(), [NUTS], [check("nuts", { judgeP: null, reader: "maybe" })]).fit).toBe("cant_tell");
    expect(evaluate(dish(), [NUTS], [check("nuts", { judgeP: null, reader: "yes" })]).fit).toBe("not_fit");
  });
  it("an Avoid rule with all-clear checks leaves no finding", () => {
    expect(evaluate(dish(), [GRAPEFRUIT], [check("gf", { judgeP: 0.05, reader: "no" })]).findings).toEqual([]);
  });
  it("uses a stricter band for Never than for Avoid", () => {
    // 0.2 is "maybe" for Never (low 0.1) but "no" for Avoid (low 0.3)
    expect(evaluate(dish(), [NUTS], [check("nuts", { judgeP: 0.2, reader: "no" })]).fit).toBe("cant_tell");
    expect(evaluate(dish(), [GRAPEFRUIT], [check("gf", { judgeP: 0.2, reader: "no" })]).fit).toBe("good");
  });
  it("falls back to the reader's first-pass tags when no second pass ran", () => {
    const unsure = dish({ tags: [tag("tree_nuts", { origin: "inferred", sureness: "unsure" })] });
    expect(evaluate(unsure, [NUTS], []).fit).toBe("cant_tell");
    const likely = dish({ tags: [tag("tree_nuts", { origin: "inferred", sureness: "likely" })] });
    expect(evaluate(likely, [NUTS], []).fit).toBe("not_fit");
  });
  it("matches through implied tags: a pork dish breaks a no-meat rule", () => {
    const meat = rule({ id: "meat", level: "never", tag: "meat" });
    expect(evaluate(dish({ tags: [tag("pork")] }), [meat]).fit).toBe("not_fit");
  });
  it("ignores checks that belong to another item", () => {
    const other: HardCheck = { itemId: "other", ruleId: "nuts", code: "match", judgeP: 0.99, reader: "yes" };
    expect(evaluate(dish(), [NUTS], [other]).fit).toBe("good");
  });
  it("ignores disabled rules", () => {
    expect(evaluate(dish({ tags: [tag("tree_nuts")] }), [{ ...NUTS, enabled: false }]).findings).toEqual([]);
  });
});

describe("answers from the restaurant", () => {
  it("a 'yes' from anyone blocks", () => {
    const c = check("nuts", { judgeP: 0.01, reader: "no", answer: { value: "yes", by: "another_user", at: "2026-11-01T00:00:00Z" } });
    expect(evaluate(dish(), [NUTS], [c]).fit).toBe("not_fit");
  });
  it("this user's 'no' replaces the question with a dated note", () => {
    const c = check("nuts", { code: "hides_in", judgeP: 0.4, reader: "maybe", answer: { value: "no", by: "this_user", at: "2026-11-14T19:00:00Z" } });
    const v = evaluate(dish(), [NUTS], [c]);
    expect(v.fit).toBe("good");
    expect(outcomes(v)).toEqual(["note"]);
    expect(v.findings[0].because).toContain("2026-11-14");
  });
  it("another user's 'no' changes nothing", () => {
    const c = check("nuts", { code: "hides_in", judgeP: 0.4, reader: "maybe", answer: { value: "no", by: "another_user", at: "2026-11-14T19:00:00Z" } });
    expect(evaluate(dish(), [NUTS], [c]).fit).toBe("cant_tell");
  });
  it("this user's 'no' cannot override a menu that names the ingredient", () => {
    const c = check("nuts", { code: "match", answer: { value: "no", by: "this_user", at: "2026-11-14T19:00:00Z" } });
    expect(evaluate(dish(), [NUTS], [c]).fit).toBe("not_fit");
  });
});

describe("hard rules on a labelled product", () => {
  it("trusts absence only when every ingredient comes from a record", () => {
    expect(absenceIsTrusted(product())).toBe(true);
    expect(absenceIsTrusted(dish())).toBe(false);
    expect(absenceIsTrusted(product({ ingredients: [] }))).toBe(false);
    expect(absenceIsTrusted(product({ ingredients: [{ name: "oats", origin: "label" }, { name: "nuts", origin: "inferred" }] }))).toBe(false);
  });
  it("clears a Never rule with no finding when the label lists everything and not this", () => {
    expect(evaluate(product(), [NUTS], []).findings).toEqual([]);
  });
  it("blocks on a label tag", () => {
    expect(evaluate(product({ tags: [tag("tree_nuts", { origin: "label" })] }), [NUTS]).fit).toBe("not_fit");
  });
  it("treats a 'may contain' statement as blocking for Never and a note for Avoid", () => {
    const mayNuts = product({ tags: [tag("tree_nuts", { origin: "label", sureness: "unsure", evidence: "may contain tree nuts" })] });
    expect(evaluate(mayNuts, [NUTS]).fit).toBe("not_fit");
    const mayGf = product({ tags: [tag("grapefruit", { origin: "label", sureness: "unsure" })] });
    expect(outcomes(evaluate(mayGf, [GRAPEFRUIT]))).toEqual(["note"]);
  });
  it("asks, rather than clearing, when a model points at a derived ingredient on a label", () => {
    const p = product({ ingredients: [{ name: "sodium caseinate", origin: "label" }], tags: [tag("dairy", { origin: "inferred", sureness: "likely", evidence: "sodium caseinate" })] });
    const dairy = rule({ id: "dairy", level: "never", tag: "dairy" });
    expect(evaluate(p, [dairy], []).fit).toBe("not_fit");
    const unsure = product({ ingredients: [{ name: "natural flavors", origin: "label" }], tags: [tag("dairy", { origin: "inferred", sureness: "unsure", evidence: "natural flavors" })] });
    const v = evaluate(unsure, [dairy], []);
    expect(v.fit).toBe("cant_tell");
    expect(v.findings[0].question).toContain("label");
  });
  it("asks when the per-rule check on a labelled product comes back 'maybe'", () => {
    const c: HardCheck = { itemId: "p", ruleId: "nuts", code: "no_match", judgeP: null, reader: "maybe" };
    expect(evaluate(product(), [NUTS], [c]).fit).toBe("cant_tell");
    const clean: HardCheck = { itemId: "p", ruleId: "nuts", code: "no_match", judgeP: null, reader: "no" };
    expect(evaluate(product(), [NUTS], [clean]).findings).toEqual([]);
  });
  it("does not clear a product whose ingredients could not be read", () => {
    expect(outcomes(evaluate(product({ ingredients: [] }), [NUTS], []))).toEqual(["confirm"]);
  });
});

describe("limit rules", () => {
  const withSodium = (mg: number, per: "serving" | "100g" = "serving") => product({ nutrients: { per, sodiumMg: mg } });
  it("reports the share of the person's own daily limit with real numbers", () => {
    const v = evaluate(withSodium(555), [SODIUM]);
    expect(v.findings[0].because).toContain("555 mg");
    expect(v.findings[0].because).toContain("37% of your daily limit");
  });
  it("uses FDA's bands: 5% or less of the daily amount is low and costs nothing", () => {
    const v = evaluate(withSodium(60), [SODIUM]);
    expect(v).toMatchObject({ fit: "good", score: 1 });
    expect(v.findings[0].because).toContain("low");
  });
  it("loses a little in between, and stays a good fit", () => {
    expect(evaluate(withSodium(200), [SODIUM])).toMatchObject({ fit: "good", score: 0.9 });
  });
  it("is only okay at 20% or more, which FDA calls high", () => {
    const v = evaluate(withSodium(300), [SODIUM]);
    expect(v).toMatchObject({ fit: "okay", score: 0.6 });
    expect(v.findings[0].because).toContain("high");
  });
  it("falls back to the FDA Daily Value when the rule sets no budget", () => {
    const noBudget = rule({ id: "na2", level: "limit", tag: "sodium" });
    const v = evaluate(withSodium(460), [noBudget]);
    expect(v.findings[0].because).toContain("20% of the Daily Value");
    expect(v.fit).toBe("okay");
  });
  it("does not count a per-100 g figure against the item", () => {
    expect(evaluate(withSodium(900, "100g"), [SODIUM])).toMatchObject({ fit: "good", score: 1 });
  });
  it("falls back to rough levels on a menu dish", () => {
    expect(evaluate(dish({ levels: { sodium: "high" } }), [SODIUM]).fit).toBe("okay");
    expect(evaluate(dish({ levels: { sodium: "low" } }), [SODIUM]).fit).toBe("good");
  });
  it("says nothing when it knows nothing", () => {
    expect(evaluate(dish(), [SODIUM]).findings).toEqual([]);
  });
  it("counts an ingredient-type Limit rule when the ingredient is present", () => {
    const salt = rule({ id: "k", level: "limit", tag: "potassium_salt_substitute" });
    const v = evaluate(product({ tags: [tag("potassium_salt_substitute", { origin: "label" })] }), [salt]);
    expect(v.fit).toBe("okay");
  });
  it("never lets soft rules alone produce Not a fit", () => {
    const sugar = rule({ id: "s", level: "limit", tag: "sugar", budget: { nutrient: "sugarG", amount: 25, unit: "g", per: "day" } });
    const fat = rule({ id: "f", level: "limit", tag: "saturated_fat", budget: { nutrient: "satFatG", amount: 13, unit: "g", per: "day" } });
    const v = evaluate(product({ nutrients: { per: "serving", sodiumMg: 2000, sugarG: 60, satFatG: 20 } }), [SODIUM, sugar, fat]);
    expect(v).toMatchObject({ fit: "okay", score: 0 });
  });
});

describe("keep-steady rules", () => {
  it("add a note and never change the fit", () => {
    const v = evaluate(dish({ tags: [tag("leafy_greens_vitamin_k", { evidence: "kale" })] }), [GREENS]);
    expect(v).toMatchObject({ fit: "good", score: 1 });
    expect(outcomes(v)).toEqual(["note"]);
  });
});

describe("combining", () => {
  it("orders findings blocked, ask, confirm, note", () => {
    const d = dish({ tags: [tag("grapefruit")], levels: { sodium: "high" } });
    const v = evaluate(d, [SODIUM, NUTS, GRAPEFRUIT], [check("nuts", { judgeP: 0.01, reader: "no" })]);
    expect(outcomes(v)).toEqual(["blocked", "confirm", "note"]);
  });
  it("gives a blocked item no score", () => {
    expect(evaluate(dish({ tags: [tag("grapefruit")] }), [GRAPEFRUIT]).score).toBeUndefined();
  });
  it("is a plain good fit when the person has no rules", () => {
    expect(evaluate(dish(), [])).toEqual({ fit: "good", score: 1, findings: [] });
  });
});

describe("second-opinion notes", () => {
  it("are added as unsourced notes and cannot change the fit", () => {
    const base = evaluate(dish({ tags: [tag("tree_nuts")] }), [NUTS]);
    const v = withSecondOpinion(base, ["Looks fine to me!", "  "]);
    expect(v.fit).toBe("not_fit");
    expect(v.findings.at(-1)).toEqual({ outcome: "note", because: "Looks fine to me!", unsourced: true });
    expect(v.findings).toHaveLength(base.findings.length + 1);
  });
});

describe("the fixture scan", () => {
  it("has the fit the evaluator actually gives each dish", () => {
    const scan = scanJson as ScanRecord;
    const rules = profileJson.rules as Rule[];
    for (const item of scan.items) {
      expect(evaluate(item, rules, scan.checks).fit, item.name).toBe(scan.verdicts[item.id].fit);
    }
  });
});
