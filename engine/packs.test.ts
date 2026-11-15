import { describe, expect, it } from "vitest";
import packsJson from "../data/packs.json";
import { compileRules, dedupeByTag } from "./compileRules";
import { customLevelsFor } from "./customRules";
import { packInfo, packList, packRules } from "./packs";
import { isKnownTag } from "./tags";

const raw = packsJson.packs as Record<string, { priceCents: number; label: string; rules: { level: string; tag: string; quote: string; reason: string }[] }>;

describe("rule packs", () => {
  it("lists every pack in the data file with a price Whop can charge", () => {
    expect(packList().map((p) => p.id)).toEqual(Object.keys(raw));
    for (const p of packList()) {
      expect(Number.isInteger(p.priceCents)).toBe(true);
      expect(p.priceCents).toBeGreaterThanOrEqual(100);
      expect(p.label.length).toBeLessThanOrEqual(60);
      expect(p.rules.length).toBeGreaterThan(0);
    }
  });

  it("uses only known tags, at a level that tag can take, each with a quote", () => {
    for (const [id, p] of Object.entries(raw)) {
      const tags = p.rules.map((r) => r.tag);
      expect(new Set(tags).size, `${id} repeats a tag`).toBe(tags.length);
      for (const r of p.rules) {
        expect(isKnownTag(r.tag), `${id}/${r.tag}`).toBe(true);
        expect(customLevelsFor(r.tag), `${id}/${r.tag} at ${r.level}`).toContain(r.level);
        expect(r.quote.trim().length).toBeGreaterThan(10);
        expect(r.reason.trim().length).toBeGreaterThan(10);
      }
    }
  });

  it("never tells anyone to take, stop or change a medicine", () => {
    for (const p of Object.values(raw)) for (const r of p.rules) expect(r.reason).not.toMatch(/\b(take|stop|dose|medication|medicine|binder)\b/i);
  });

  it("turns a pack into sourced rules that carry the pack's name and the quote", () => {
    const rules = packRules(["pregnancy"]);
    expect(rules.map((r) => r.id)).toEqual(raw.pregnancy.rules.map((r) => `pack:pregnancy:${r.tag}`));
    for (const r of rules) {
      expect(r.status).toBe("sourced");
      expect(r.enabled).toBe(true);
      expect(r.from).toEqual({ type: "condition", label: "Pregnancy pack" });
      expect(r.source.url).toMatch(/^https:\/\//);
      expect(r.source.quote).toBeTruthy();
    }
    expect(rules.find((r) => r.tag === "alcohol")?.level).toBe("never");
  });

  it("adds nothing for an unknown pack and does not double a pack listed twice", () => {
    expect(packRules(["nope"])).toEqual([]);
    expect(packInfo("nope")).toBeNull();
    expect(packRules(["pregnancy", "pregnancy"])).toHaveLength(raw.pregnancy.rules.length);
  });

  it("never weakens a rule the profile already has on the same tag", () => {
    // Kidney disease limits potassium salt substitutes; the hemodialysis pack avoids them: the stronger one stays.
    const profile = { medications: [], conditions: [{ name: "Chronic kidney disease", key: "ckd" }], allergies: ["dairy"], diets: [] };
    const merged = dedupeByTag([...compileRules(profile), ...packRules(["hemodialysis", "ibs_low_fodmap"])]);
    expect(merged.find((r) => r.tag === "potassium_salt_substitute")?.level).toBe("avoid");
    expect(merged.find((r) => r.tag === "dairy")?.level).toBe("never");
    // Same level on both sides: the profile's own rule is kept, so nothing changes under the person.
    expect(merged.find((r) => r.tag === "sodium")?.id).toBe("cond:ckd:sodium");
    expect(new Set(merged.map((r) => r.tag)).size).toBe(merged.length);
  });
});
