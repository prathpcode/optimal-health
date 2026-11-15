import { describe, expect, it } from "vitest";
import { chooseLabel, dailyMedUrl, foodCandidates, quoteIsInLabel, rulesFromPicks, sentences } from "./labelRules";

const LABEL = {
  set_id: "abc-123",
  effective_time: "20260101",
  openfda: { generic_name: ["SIMVASTATIN"], substance_name: ["SIMVASTATIN"] },
  drug_interactions: [
    "7 DRUG INTERACTIONS Grapefruit juice increases exposure.   Avoid grapefruit juice when taking simvastatin. Take in the evening.",
  ],
  information_for_patients: ["Tell your doctor if you drink more than two glasses of alcohol daily. Store at room temperature."],
  clinical_pharmacology: ["Grapefruit juice raised plasma levels in a study of 12 volunteers given 200 mL."],
};
const INFO = { rxcui: "36567", drugName: "simvastatin", setId: "abc-123", title: "Simvastatin prescribing information (FDA label)" };

describe("sentences", () => {
  it("splits on sentence ends and collapses whitespace", () => {
    expect(sentences("One thing.   Another thing!\nA third?")).toEqual(["One thing.", "Another thing!", "A third?"]);
  });
  it("starts a new piece at a numbered section heading", () => {
    expect(sentences("Avoid grapefruit juice when taking simvastatin. 7.2 Simvastatin Effects on Other Drugs Table 3 presents more.")).toEqual([
      "Avoid grapefruit juice when taking simvastatin.",
      "7.2 Simvastatin Effects on Other Drugs Table 3 presents more.",
    ]);
  });
  it("does not end a sentence at St. or e.g.", () => {
    expect(sentences("Foods can interact (e.g., grapefruit juice, St. John's wort). Next one.")).toEqual([
      "Foods can interact (e.g., grapefruit juice, St. John's wort).",
      "Next one.",
    ]);
  });
  it("does not split inside decimals or abbreviations followed by lowercase", () => {
    expect(sentences("Doses of 1.2 liters e.g. daily were used. Next.")).toEqual(["Doses of 1.2 liters e.g. daily were used.", "Next."]);
  });
});

describe("foodCandidates", () => {
  const c = foodCandidates(LABEL);
  it("keeps only sentences that mention a food or drink, from the sections that carry instructions", () => {
    expect(c.map((x) => x.text)).toEqual([
      "7 DRUG INTERACTIONS Grapefruit juice increases exposure.",
      "Avoid grapefruit juice when taking simvastatin.",
      "Tell your doctor if you drink more than two glasses of alcohol daily.",
    ]);
  });
  it("keeps a sentence that names a herbal supplement, curly apostrophe and all", () => {
    const label = { drug_interactions: ["Avoid concomitant use with strong inducers (e.g., rifampin, carbamazepine, St. John\u2019s wort) because such drugs will decrease exposure to apixaban."] };
    expect(foodCandidates(label).map((x) => x.text)).toHaveLength(1);
  });
  it("ignores the pharmacology section", () => {
    expect(c.some((x) => x.text.includes("volunteers"))).toBe(false);
  });
  it("gives sentences that are verbatim in the label", () => {
    for (const x of c) expect(quoteIsInLabel(LABEL, x.text)).toBe(true);
  });
});

describe("quoteIsInLabel", () => {
  it("is whitespace-insensitive but otherwise exact", () => {
    expect(quoteIsInLabel(LABEL, "Avoid  grapefruit juice\nwhen taking simvastatin.")).toBe(true);
    expect(quoteIsInLabel(LABEL, "Avoid grapefruit when taking simvastatin.")).toBe(false);
    expect(quoteIsInLabel(LABEL, "")).toBe(false);
  });
});

describe("rulesFromPicks", () => {
  const c = foodCandidates(LABEL);
  it("builds a quoted, linked rule from a valid pick", () => {
    const [r] = rulesFromPicks([{ sentence: 2, tag: "grapefruit", level: "avoid", reason: "The label says to avoid grapefruit juice." }], c, INFO, "Zocor", LABEL);
    expect(r).toMatchObject({
      id: "med:36567:grapefruit", level: "avoid", tag: "grapefruit", status: "from_label", enabled: true,
      from: { type: "medication", label: "Zocor" },
      source: { url: dailyMedUrl("abc-123"), quote: "Avoid grapefruit juice when taking simvastatin." },
    });
  });
  it("drops picks with a bad sentence number, an unknown or disallowed tag, or a level a label cannot set", () => {
    const picks = [
      { sentence: 99, tag: "grapefruit", level: "avoid", reason: "" },
      { sentence: 2, tag: "moonbeams", level: "avoid", reason: "" },
      { sentence: 2, tag: "tree_nuts", level: "avoid", reason: "" },
      { sentence: 2, tag: "grapefruit", level: "never", reason: "" },
      { sentence: 1.5, tag: "grapefruit", level: "avoid", reason: "" },
    ];
    expect(rulesFromPicks(picks, c, INFO, "simvastatin", LABEL)).toEqual([]);
  });
  it("keeps one rule per tag, the strongest", () => {
    const rules = rulesFromPicks(
      [{ sentence: 1, tag: "grapefruit", level: "limit", reason: "a" }, { sentence: 2, tag: "grapefruit", level: "avoid", reason: "b" }, { sentence: 3, tag: "alcohol", level: "limit", reason: "c" }],
      c, INFO, "simvastatin", LABEL,
    );
    expect(rules.map((r) => `${r.tag}:${r.level}`).sort()).toEqual(["alcohol:limit", "grapefruit:avoid"]);
  });
  it("refuses a candidate that is not in the label it is checked against", () => {
    const fake = [{ section: "drug_interactions", text: "Avoid bananas entirely with simvastatin." }];
    expect(rulesFromPicks([{ sentence: 1, tag: "high_potassium_food", level: "avoid", reason: "" }], fake, INFO, "simvastatin", LABEL)).toEqual([]);
  });
});

describe("chooseLabel", () => {
  it("skips combination products and prefers the label with more food sentences", () => {
    const combo = { ...LABEL, set_id: "combo", openfda: { generic_name: ["EZETIMIBE AND SIMVASTATIN"], substance_name: ["EZETIMIBE", "SIMVASTATIN"] } };
    const thin = { ...LABEL, set_id: "thin", drug_interactions: ["Nothing relevant here at all, really nothing."], information_for_patients: [] };
    expect(chooseLabel([combo, thin, LABEL], "simvastatin")?.set_id).toBe("abc-123");
    expect(chooseLabel([combo], "simvastatin")).toBeNull();
  });
});
