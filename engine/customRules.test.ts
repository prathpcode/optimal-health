import { describe, expect, it } from "vitest";
import { checkCustomRule, customLevelsFor } from "./customRules";
import type { Rule } from "./types";

const rule = (over: Partial<Rule> & { custom?: boolean }): Rule & { custom?: boolean } => ({
  id: "r", level: "never", tag: "tree_nuts", reason: "t", source: { title: "t", url: "u" }, from: { type: "allergy", label: "tree nut allergy" }, status: "library", enabled: true, ...over,
});

describe("customLevelsFor", () => {
  it("lets a nutrient only be limited", () => {
    expect(customLevelsFor("sodium")).toEqual(["limit"]);
  });
  it("lets an ingredient be ruled out, avoided or limited", () => {
    expect(customLevelsFor("pork")).toEqual(["never", "avoid", "limit"]);
  });
  it("offers nothing for a tag that does not exist", () => {
    expect(customLevelsFor("not_a_tag")).toEqual([]);
  });
});

describe("checkCustomRule", () => {
  it("replaces nothing when the tag has no rule yet", () => {
    expect(checkCustomRule([rule({})], "pork", "avoid")).toEqual({ replaces: [], weakens: null });
  });
  it("refuses to turn an allergy's Never into something weaker", () => {
    const nuts = rule({});
    expect(checkCustomRule([nuts], "tree_nuts", "avoid").weakens).toBe(nuts);
    expect(checkCustomRule([nuts], "tree_nuts", "limit").weakens).toBe(nuts);
  });
  it("allows the same level or a stronger one, and says what it replaces", () => {
    const grapefruit = rule({ id: "gf", tag: "grapefruit", level: "avoid", from: { type: "medication", label: "simvastatin" } });
    expect(checkCustomRule([grapefruit], "grapefruit", "never")).toEqual({ replaces: [grapefruit], weakens: null });
    expect(checkCustomRule([grapefruit], "grapefruit", "avoid").weakens).toBeNull();
  });
  it("does not guard a rule the person switched off, or one they wrote themselves", () => {
    expect(checkCustomRule([rule({ enabled: false })], "tree_nuts", "limit").weakens).toBeNull();
    expect(checkCustomRule([rule({ custom: true })], "tree_nuts", "limit").weakens).toBeNull();
  });
});
