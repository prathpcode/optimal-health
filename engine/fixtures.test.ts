import { describe, expect, it } from "vitest";
import scanJson from "../fixtures/scan.done.json";
import profileJson from "../fixtures/profile.json";
import type { Profile, Rule, ScanRecord } from "./types";

// The fixtures are what the app is built against, so they must stay valid ScanRecord / Rule data.
const scan = scanJson as ScanRecord;
const rules = profileJson.rules as Rule[];
const profile = profileJson.profile as Profile;

describe("fixtures", () => {
  const itemIds = new Set(scan.items.map((i) => i.id));
  const ruleIds = new Set(rules.map((r) => r.id));

  it("has a verdict, a ranking row and an explanation for every item", () => {
    for (const id of itemIds) {
      expect(scan.verdicts[id], `verdict for ${id}`).toBeDefined();
      expect(scan.explanations[id], `explanation for ${id}`).toBeDefined();
      expect(scan.ranking.filter((r) => r.itemId === id)).toHaveLength(1);
    }
  });

  it("only refers to items and rules that exist", () => {
    for (const c of scan.checks) {
      expect(itemIds.has(c.itemId)).toBe(true);
      expect(ruleIds.has(c.ruleId)).toBe(true);
    }
    for (const q of scan.questions) {
      expect(itemIds.has(q.itemId)).toBe(true);
      expect(ruleIds.has(q.ruleId)).toBe(true);
    }
    for (const v of Object.values(scan.verdicts)) {
      for (const f of v.findings) {
        if (f.ruleId) expect(ruleIds.has(f.ruleId)).toBe(true);
        else expect(f.unsourced).toBe(true);
      }
    }
  });

  it("never shows an inferred dish as a clean good fit when the profile has a Never rule", () => {
    const never = rules.filter((r) => r.level === "never" && r.enabled);
    expect(never.length).toBeGreaterThan(0);
    for (const item of scan.items) {
      const v = scan.verdicts[item.id];
      if (v.fit !== "good") continue;
      for (const r of never) {
        expect(v.findings.some((f) => f.ruleId === r.id && f.outcome === "confirm")).toBe(true);
      }
    }
  });

  it("gives every tag its evidence", () => {
    for (const item of scan.items) for (const t of item.tags) expect(t.evidence, `${item.name}/${t.tag}`).toBeTruthy();
  });

  it("has a profile whose allergies are covered by a Never rule", () => {
    for (const a of profile.allergies) expect(rules.some((r) => r.tag === a && r.level === "never")).toBe(true);
  });
});
