import { describe, expect, it } from "vitest";
import { duplicateFindings, warningClauses, warningFindings, withLabelFindings, type ProfileItem } from "./otc";
import { itemFromProduct, supplementTags } from "./product";
import { evaluate } from "./evaluate";
import type { Rule, Verdict } from "./types";

const PROFILE: ProfileItem[] = [{ label: "apixaban", kind: "medication" }, { label: "Crohn's disease", kind: "condition" }];
const CLAUSES = warningClauses({
  do_not_use: "if you have ever had an allergic reaction to any other pain reliever/fever reducer ■ right before or after heart surgery",
  ask_doctor: "■ stomach bleeding warning applies to you ■ you have high blood pressure, heart disease, liver cirrhosis, or kidney disease",
  ask_doctor_or_pharmacist: "■ taking a blood thinning (anticoagulant) or steroid drug ■ under a doctor's care for any serious condition",
});

describe("warningClauses", () => {
  it("splits each printed section into its bullets, keeping the words exactly", () => {
    expect(CLAUSES.map((c) => `${c.section}|${c.text}`)).toEqual([
      "do_not_use|if you have ever had an allergic reaction to any other pain reliever/fever reducer",
      "do_not_use|right before or after heart surgery",
      "ask_doctor|stomach bleeding warning applies to you",
      "ask_doctor|you have high blood pressure, heart disease, liver cirrhosis, or kidney disease",
      "ask_doctor_or_pharmacist|taking a blood thinning (anticoagulant) or steroid drug",
      "ask_doctor_or_pharmacist|under a doctor's care for any serious condition",
    ]);
  });
  it("splits on whichever bullet character the photo reading produced", () => {
    expect(warningClauses({ ask_doctor: "▯ liver disease □ glaucoma • a breathing problem" }).map((c) => c.text)).toEqual(["liver disease", "glaucoma", "a breathing problem"]);
  });
  it("returns nothing for empty sections", () => {
    expect(warningClauses({ do_not_use: "  " })).toEqual([]);
  });
});

describe("warningFindings", () => {
  it("quotes the label and names the profile item, as a question for the pharmacist", () => {
    const [f] = warningFindings(CLAUSES, [{ clause: 5, about: "apixaban", why: "apixaban is an anticoagulant" }], PROFILE, "Advil");
    expect(f).toMatchObject({ outcome: "ask", about: "apixaban", source: { quote: "taking a blood thinning (anticoagulant) or steroid drug" } });
    expect(f.question).toContain("pharmacist");
    expect(f.ruleId).toBeUndefined();
  });
  it("blocks on a 'do not use' line", () => {
    expect(warningFindings(CLAUSES, [{ clause: 2, about: "apixaban", why: "" }], PROFILE, "Advil")[0].outcome).toBe("blocked");
  });
  it("drops picks with a bad clause number or a profile item the person does not have", () => {
    expect(warningFindings(CLAUSES, [{ clause: 99, about: "apixaban", why: "" }, { clause: 4, about: "kidney disease", why: "" }, { clause: 1.5, about: "apixaban", why: "" }], PROFILE, "Advil")).toEqual([]);
  });
  it("keeps one finding per clause and profile item", () => {
    const picks = [{ clause: 5, about: "apixaban", why: "" }, { clause: 5, about: "Apixaban", why: "" }];
    expect(warningFindings(CLAUSES, picks, PROFILE, "Advil")).toHaveLength(1);
  });
});

describe("duplicateFindings", () => {
  const taking = [{ medication: "Tylenol", ingredients: ["acetaminophen"] }, { medication: "Zocor", ingredients: ["simvastatin"] }];
  it("spots an active ingredient the person already takes, through salts and strengths", () => {
    const f = duplicateFindings([{ name: "Acetaminophen 325 mg" }, { name: "Dextromethorphan HBr" }], taking, "NyQuil");
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ outcome: "ask", about: "Tylenol" });
    expect(f[0].because).toContain("also in your Tylenol");
  });
  it("finds nothing when nothing overlaps", () => {
    expect(duplicateFindings([{ name: "Loratadine" }], taking, "Claritin")).toEqual([]);
  });
});

describe("withLabelFindings", () => {
  const good: Verdict = { fit: "good", score: 1, findings: [] };
  const ask = warningFindings(CLAUSES, [{ clause: 5, about: "apixaban", why: "" }], PROFILE, "Advil");
  it("can only make a verdict more cautious", () => {
    expect(withLabelFindings(good, ask).fit).toBe("cant_tell");
    const blocked: Verdict = { fit: "not_fit", findings: [{ ruleId: "x", outcome: "blocked", because: "b" }] };
    expect(withLabelFindings(blocked, ask).fit).toBe("not_fit");
    expect(withLabelFindings(good, [])).toBe(good);
  });
  it("puts blocking findings first", () => {
    const both = [...ask, ...warningFindings(CLAUSES, [{ clause: 2, about: "apixaban", why: "" }], PROFILE, "Advil")];
    const v = withLabelFindings(good, both);
    expect(v.fit).toBe("not_fit");
    expect(v.findings[0].outcome).toBe("blocked");
  });
});

describe("supplements", () => {
  const wort: Rule = { id: "med:1:st_johns_wort", level: "avoid", tag: "st_johns_wort", reason: "t", source: { title: "t", url: "u", quote: "q" }, from: { type: "medication", label: "apixaban" }, status: "from_label", enabled: true };
  it("tags supplement ingredients by name", () => {
    expect(supplementTags("Hypericum perforatum extract").map((t) => t.tag)).toEqual(["st_johns_wort"]);
    expect(supplementTags("Iron (as ferrous fumarate)").map((t) => t.tag)).toContain("iron_supplement");
  });
  it("blocks a scanned supplement that a medication label says to avoid", () => {
    const item = itemFromProduct({ source: "label", panel: "supplement", name: "Mood Support", actives: [{ name: "St. John's Wort extract", amount: "300 mg" }], ingredientsText: "gelatin, rice flour" });
    expect(item.kind).toBe("supplement");
    expect(evaluate(item, [wort]).fit).toBe("not_fit");
  });
  it("does not mistake a tablet's inactive ingredients for mineral supplements", () => {
    const tablet = itemFromProduct({ source: "label", panel: "otc", name: "Ibuprofen", actives: [{ name: "Ibuprofen 200 mg" }], ingredientsText: "magnesium stearate, iron oxide red, calcium phosphate, zinc stearate" });
    expect(tablet.tags.filter((t) => t.tag.endsWith("_supplement"))).toEqual([]);
    const mineral = itemFromProduct({ source: "label", panel: "supplement", name: "Cal-Mag", actives: [{ name: "Calcium (as calcium carbonate)" }, { name: "Magnesium (as magnesium oxide)" }] });
    expect(mineral.tags.map((t) => t.tag).sort()).toEqual(["calcium_supplement", "magnesium_supplement"]);
  });
  it("never applies supplement tags to food", () => {
    const milk = itemFromProduct({ source: "label", name: "Whole milk", ingredientsText: "Milk, vitamin D3, calcium" });
    expect(milk.tags.some((t) => t.tag === "calcium_supplement")).toBe(false);
    expect(milk.kind).toBe("product");
  });
});
