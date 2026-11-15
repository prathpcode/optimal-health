import { describe, expect, it } from "vitest";
import { compileRules, conditionKey, conditionNotes } from "./compileRules";
import { afterAnswer, applyAnswer, applySecondOpinions, buildChecks, buildQuestions, buildRanking, buildVerdicts, itemsFromReader, type ReaderDish } from "./pipeline";
import { duplicateFindings } from "./otc";
import { buildVerdicts as verdictsFor } from "./pipeline";
import { itemFromProduct } from "./product";
import type { Rule } from "./types";

const dishOf = (over: Partial<ReaderDish> & { name: string }): ReaderDish => ({ description: "", ingredients: [], tags: [], levels: [], ...over });
const rules = compileRules({ medications: [], conditions: [], allergies: ["tree_nuts"], diets: [] });
const GRAPEFRUIT: Rule = {
  id: "gf", level: "avoid", tag: "grapefruit", reason: "t", source: { title: "t", url: "u" }, from: { type: "medication", label: "simvastatin" }, status: "unverified", enabled: true,
};
const SODIUM: Rule = { ...GRAPEFRUIT, id: "na", level: "limit", tag: "sodium", from: { type: "condition", label: "high blood pressure" } };
const ALL = [...rules, GRAPEFRUIT, SODIUM];

describe("compileRules", () => {
  it("makes a Never rule per allergy and per diet exclusion", () => {
    const r = compileRules({ medications: [], conditions: [], allergies: ["tree_nuts"], diets: ["vegetarian"] });
    expect(r.map((x) => x.tag).sort()).toEqual(["fish", "gelatin", "meat", "mollusc", "shellfish", "tree_nuts"]);
    expect(r.every((x) => x.level === "never" && x.enabled)).toBe(true);
  });
  it("does not duplicate a tag reached twice, and ignores unknown entries", () => {
    const r = compileRules({ medications: [], conditions: [], allergies: ["dairy", "not_a_tag"], diets: ["vegan", "nope"] });
    expect(r.filter((x) => x.tag === "dairy")).toHaveLength(1);
    expect(r.some((x) => x.tag === "not_a_tag")).toBe(false);
  });
  it("produces nothing for medications: those rules come from FDA labels on the backend", () => {
    expect(compileRules({ medications: [{ name: "simvastatin" }], conditions: [], allergies: [], diets: [] })).toEqual([]);
  });
  it("compiles sourced rules for a condition, with the quote and a budget where the source gives one", () => {
    const r = compileRules({ medications: [], conditions: [{ name: "High blood pressure (hypertension)" }], allergies: [], diets: [] });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: "cond:hypertension:sodium", level: "limit", status: "sourced", budget: { amount: 2300 }, from: { type: "condition" } });
    expect(r[0].source.quote).toContain("2,300 mg");
  });
  it("does not mistake pulmonary hypertension or diabetes insipidus for the common condition", () => {
    expect(conditionKey("Pulmonary hypertension")).toBeNull();
    expect(conditionKey("Diabetes insipidus")).toBeNull();
    expect(conditionKey("Type 2 diabetes mellitus")).toBe("diabetes");
    expect(conditionKey("Crohns disease")).toBeNull();
  });
  it("treats celiac disease as a Never rule on gluten", () => {
    const r = compileRules({ medications: [], conditions: [{ name: "Celiac disease" }], allergies: [], diets: [] });
    expect(r).toMatchObject([{ level: "never", tag: "gluten" }]);
  });
  it("keeps one sodium rule when two conditions both limit it, preferring the one with a budget", () => {
    const r = compileRules({ medications: [], conditions: [{ name: "Heart failure" }, { name: "Hypertension" }], allergies: [], diets: [] });
    expect(r.filter((x) => x.tag === "sodium")).toHaveLength(1);
    expect(r.find((x) => x.tag === "sodium")!.budget?.amount).toBe(2300);
  });
  it("explains conditions that produce no rules", () => {
    const notes = conditionNotes({ medications: [], conditions: [{ name: "Ulcerative colitis" }, { name: "Psoriasis" }, { name: "Hypertension" }], allergies: [], diets: [] });
    expect(notes.map((n) => n.kind)).toEqual(["no_standard_rules", "not_in_library"]);
    expect(notes[0].source?.quote).toContain("specific foods");
  });

});

describe("itemsFromReader", () => {
  it("drops a tag whose evidence is not in the dish's own words", () => {
    const [item] = itemsFromReader([dishOf({ name: "House salad", description: "mixed leaves", tags: [{ tag: "tree_nuts", sureness: "likely", evidence: "candied walnuts" }] })]);
    expect(item.tags).toEqual([]);
  });
  it("keeps an inferred tag whose evidence is a word on the menu, capped at 'likely'", () => {
    const [item] = itemsFromReader([dishOf({ name: "Pesto pasta", description: "basil pesto", tags: [{ tag: "tree_nuts", sureness: "certain", evidence: "pesto" }] })]);
    expect(item.tags).toEqual([{ tag: "tree_nuts", sureness: "likely", origin: "inferred", evidence: "pesto" }]);
  });
  it("marks a tag certain only when code finds the literal name, whatever the model said", () => {
    const [item] = itemsFromReader([dishOf({ name: "Beet salad", description: "candied walnuts, goat cheese", tags: [{ tag: "tree_nuts", sureness: "unsure", evidence: "walnuts" }] })]);
    expect(item.tags.find((t) => t.tag === "tree_nuts")).toMatchObject({ sureness: "certain", origin: "menu_text" });
    expect(item.tags.some((t) => t.tag === "dairy")).toBe(true);
  });
  it("treats a 'stated' ingredient with no matching words as inferred", () => {
    const [item] = itemsFromReader([dishOf({ name: "House salad", ingredients: [{ name: "walnuts", stated: true, evidence: "walnuts" }, { name: "leaves", stated: true, evidence: "salad" }] })]);
    expect(item.ingredients).toEqual([{ name: "walnuts", origin: "inferred" }, { name: "leaves", origin: "menu_text", evidence: "salad" }]);
  });
  it("drops unknown tags and keeps nutrients as levels only", () => {
    const [item] = itemsFromReader([
      dishOf({ name: "Ramen", description: "pork broth", tags: [{ tag: "made_up", sureness: "likely", evidence: "ramen" }, { tag: "sodium", sureness: "likely", evidence: "broth" }], levels: [{ nutrient: "sodium", level: "high" }, { nutrient: "tree_nuts", level: "high" }] }),
    ]);
    expect(item.tags.map((t) => t.tag)).toEqual(["pork"]);
    expect(item.levels).toEqual({ sodium: "high" });
  });
  it("numbers items in menu order", () => {
    expect(itemsFromReader([dishOf({ name: "A" }), dishOf({ name: "B" })]).map((i) => i.id)).toEqual(["d1", "d2"]);
  });
});

describe("checks, verdicts, questions and ranking together", () => {
  const items = itemsFromReader([
    dishOf({ name: "Grilled salmon", description: "lemon, rice", levels: [{ nutrient: "sodium", level: "low" }] }),
    dishOf({ name: "Pesto pasta", description: "basil pesto, parmesan" }),
    dishOf({ name: "Beet salad", description: "candied walnuts" }),
    dishOf({ name: "Ramen", description: "pork broth, soft egg", levels: [{ nutrient: "sodium", level: "high" }] }),
    dishOf({ name: "Paloma", description: "tequila, grapefruit soda" }),
  ]);
  const reader = [
    { itemId: "d1", tag: "tree_nuts", answer: "no" as const },
    { itemId: "d2", tag: "tree_nuts", answer: "maybe" as const },
    { itemId: "d4", tag: "tree_nuts", answer: "no" as const },
  ];
  const checks = buildChecks(items, ALL, reader);
  const verdicts = buildVerdicts(items, ALL, checks);

  it("builds one check per item per hard rule and none for limit rules", () => {
    expect(checks).toHaveLength(items.length * 2);
    expect(checks.find((c) => c.itemId === "d2" && c.ruleId === "allergy:tree_nuts")).toMatchObject({ code: "hides_in", reader: "maybe", judgeP: null });
    expect(checks.find((c) => c.itemId === "d3" && c.ruleId === "allergy:tree_nuts")?.code).toBe("match");
  });
  it("gives each dish the expected fit", () => {
    expect(Object.fromEntries(items.map((i) => [i.name, verdicts[i.id].fit]))).toEqual({
      "Grilled salmon": "good", "Pesto pasta": "cant_tell", "Beet salad": "not_fit", Ramen: "okay", Paloma: "not_fit",
    });
  });
  it("asks only about real unknowns: confirms stay on the dish and ruled-out dishes are skipped", () => {
    const qs = buildQuestions(items, verdicts);
    expect(qs.map((q) => q.itemId)).toEqual(["d2"]);
    expect(qs[0]).toMatchObject({ ruleId: "allergy:tree_nuts", id: "q:d2:allergy:tree_nuts" });
  });
  it("sections by verdict only: a model cannot promote a blocked dish or reword its line", () => {
    const ranking = buildRanking(items, verdicts, ALL, [
      { itemId: "d3", line: "Delicious and perfect for you!", modification: "just pick the nuts off" },
      { itemId: "d1", line: "Light and low in sodium." },
      { itemId: "ghost", line: "not a real dish" },
    ]);
    expect(ranking.map((r) => `${r.itemId}:${r.section}`)).toEqual(["d1:best", "d4:okay", "d2:cant_tell", "d3:not_fit", "d5:not_fit"]);
    const blocked = ranking.find((r) => r.itemId === "d3")!;
    expect(blocked.line).toBe("Tree nuts (tree nuts allergy).");
    expect(blocked.modification).toBeUndefined();
    expect(ranking.find((r) => r.itemId === "d1")!.line).toBe("Light and low in sodium.");
    expect(ranking).toHaveLength(items.length);
  });
  it("lets second opinions add notes without moving anything", () => {
    const withNotes = applySecondOpinions(verdicts, [{ itemId: "d3", note: "Probably fine." }]);
    expect(withNotes.d3.fit).toBe("not_fit");
    expect(withNotes.d3.findings.at(-1)).toMatchObject({ unsourced: true, outcome: "note" });
    expect(withNotes.d1).toEqual(verdicts.d1);
  });
  it("an answer of 'yes' blocks the dish; 'no' turns the question into a dated note", () => {
    const q = buildQuestions(items, verdicts)[0];
    const yes = buildVerdicts(items, ALL, applyAnswer(checks, q, "yes", "2026-11-14T20:00:00Z"));
    expect(yes.d2.fit).toBe("not_fit");
    const no = buildVerdicts(items, ALL, applyAnswer(checks, q, "no", "2026-11-14T20:00:00Z"));
    expect(no.d2.fit).toBe("good");
    expect(no.d2.findings[0].because).toContain("2026-11-14");
    expect(no.d1).toEqual(verdicts.d1);
  });
  it("afterAnswer re-sections the dish, keeps the answered question, and leaves the rest alone", () => {
    const questions = buildQuestions(items, verdicts);
    const ranking = buildRanking(items, verdicts, ALL, [{ itemId: "d1", line: "Light and low in sodium." }]);
    const scan = { items, checks, verdicts: applySecondOpinions(verdicts, [{ itemId: "d4", note: "Broth may be finished with sesame." }]), ranking, questions };
    const yes = afterAnswer(scan, ALL, questions[0].id, "yes", "2026-11-14T20:00:00Z")!;
    expect(yes.ranking.find((r) => r.itemId === "d2")!.section).toBe("not_fit");
    expect(yes.questions.find((q) => q.id === questions[0].id)!.answer).toBe("yes");
    expect(yes.ranking.find((r) => r.itemId === "d1")!.line).toBe("Light and low in sodium.");
    expect(yes.verdicts.d4.findings.some((f) => f.unsourced)).toBe(true);
    const no = afterAnswer(scan, ALL, questions[0].id, "no", "2026-11-14T20:00:00Z")!;
    expect(no.ranking.find((r) => r.itemId === "d2")!.section).toBe("best");
    const skipped = afterAnswer(scan, ALL, questions[0].id, "skipped", "2026-11-14T20:00:00Z")!;
    expect(skipped.verdicts.d2.fit).toBe("cant_tell");
    expect(skipped.questions.find((q) => q.id === questions[0].id)!.answer).toBe("skipped");
    expect(afterAnswer(scan, ALL, "nope", "yes", "x")).toBeNull();
  });
});

describe("afterAnswer on a medicine", () => {
  it("keeps findings that came from the package label, so answering a question cannot improve the verdict", () => {
    const item = itemFromProduct({ source: "label", panel: "otc", name: "NiteCalm", actives: [{ name: "Acetaminophen 650 mg" }], ingredientsText: "natural flavors" });
    const dairy: Rule = { ...GRAPEFRUIT, id: "dairy", level: "never", tag: "dairy", from: { type: "allergy", label: "milk allergy" } };
    const checks = buildChecks([item], [dairy], [{ itemId: item.id, tag: "dairy", answer: "maybe" }]);
    const base = verdictsFor([item], [dairy], checks);
    const dup = duplicateFindings([{ name: "Acetaminophen 650 mg" }], [{ medication: "Tylenol", ingredients: ["acetaminophen"] }], "NiteCalm");
    const verdicts = { [item.id]: { fit: "cant_tell" as const, findings: [...dup, ...base[item.id].findings] } };
    const questions = buildQuestions([item], verdicts);
    expect(questions).toHaveLength(1);
    const next = afterAnswer({ items: [item], checks, verdicts, ranking: buildRanking([item], verdicts, [dairy]), questions }, [dairy], questions[0].id, "no", "2026-11-14T20:00:00Z")!;
    expect(next.verdicts[item.id].fit).toBe("cant_tell");
    expect(next.verdicts[item.id].findings.some((f) => f.about === "Tylenol" && f.source)).toBe(true);
  });
});
