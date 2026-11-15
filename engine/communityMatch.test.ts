import { describe, expect, it } from "vitest";
import conditionsJson from "../data/rules/conditions.json";
import { COMMUNITY_GROUPS, communitiesFor, diffMemberships, matchCommunities } from "./communityMatch";
import type { Profile } from "./types";

const profile = (over: Partial<Profile>): Profile => ({ medications: [], conditions: [], allergies: [], diets: [], ...over });

describe("community groups", () => {
  it("puts every library condition in exactly one condition room", () => {
    for (const key of Object.keys(conditionsJson.conditions)) {
      const rooms = COMMUNITY_GROUPS.filter((g) => g.auto && g.conditions?.includes(key));
      expect(rooms.map((r) => r.slug), key).toHaveLength(1);
    }
  });
  it("names only conditions that exist, and has unique slugs", () => {
    const known = new Set(Object.keys(conditionsJson.conditions));
    for (const g of COMMUNITY_GROUPS) for (const k of g.conditions ?? []) expect(known.has(k), k).toBe(true);
    expect(new Set(COMMUNITY_GROUPS.map((g) => g.slug)).size).toBe(COMMUNITY_GROUPS.length);
  });
});

describe("communitiesFor", () => {
  it("puts related conditions in the same room", () => {
    const a = communitiesFor(profile({ conditions: [{ name: "High blood pressure", key: "hypertension" }] }));
    const b = communitiesFor(profile({ conditions: [{ name: "Heart failure", key: "heart_failure" }] }));
    expect(a.map((m) => m.slug)).toEqual(["heart-health"]);
    expect(b.map((m) => m.slug)).toEqual(["heart-health"]);
  });
  it("resolves a typed condition with no key through the library", () => {
    const m = communitiesFor(profile({ conditions: [{ name: "celiac disease" }] }));
    expect(m.map((x) => x.slug)).toEqual(["gluten-free"]);
    expect(m[0].reasons[0]).toMatch(/celiac/i);
  });
  it("places nobody for a condition the library does not know", () => {
    expect(communitiesFor(profile({ conditions: [{ name: "Something rare" }] }))).toEqual([]);
  });
  it("adds a diet or allergy to a condition room's reasons, and returns several rooms", () => {
    const m = communitiesFor(profile({
      conditions: [{ name: "CKD", key: "ckd" }, { name: "Celiac", key: "celiac" }],
      diets: ["gluten_free"],
    }));
    expect(m.map((x) => x.slug)).toEqual(["kidney-health", "gluten-free"]);
    expect(m[1].reasons).toHaveLength(2);
  });
  it("never places anyone in an optional room automatically", () => {
    const p = profile({ diets: ["vegan"], allergies: ["peanuts"] });
    expect(communitiesFor(p)).toEqual([]);
    expect(matchCommunities(p).map((m) => m.slug)).toEqual(["plant-based", "nut-allergy"]);
  });
});

describe("diffMemberships", () => {
  it("joins new matches and leaves automatic rooms that no longer match", () => {
    expect(diffMemberships([{ slug: "gout", source: "auto" }], ["heart-health"])).toEqual({ join: ["heart-health"], leave: ["gout"] });
  });
  it("keeps a room joined by hand", () => {
    expect(diffMemberships([{ slug: "gout", source: "manual" }], [])).toEqual({ join: [], leave: [] });
  });
  it("does not re-add a room the person left", () => {
    expect(diffMemberships([], ["heart-health"], ["heart-health"])).toEqual({ join: [], leave: [] });
  });
  it("removes an automatic room the person opted out of", () => {
    expect(diffMemberships([{ slug: "gout", source: "auto" }], ["gout"], ["gout"])).toEqual({ join: [], leave: ["gout"] });
  });
});
