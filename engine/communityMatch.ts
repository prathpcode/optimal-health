import communitiesJson from "../data/communities.json";
import conditionsJson from "../data/rules/conditions.json";
import dietsJson from "../data/rules/diets.json";
import allergiesJson from "../data/rules/allergies.json";
import { conditionKey } from "./compileRules";
import { tagLabel } from "./tags";
import type { Profile } from "./types";

/** A community room. Condition groups (`auto`) are filled from people's conditions; the rest are joined by hand. */
export type CommunityGroup = {
  slug: string;
  title: string;
  blurb: string;
  icon: string;
  auto: boolean;
  conditions?: string[];
  diets?: string[];
  allergies?: string[];
};

export const COMMUNITY_GROUPS = communitiesJson.groups as CommunityGroup[];

const CONDITION_LABELS = Object.fromEntries(
  Object.entries(conditionsJson.conditions as Record<string, { label: string }>).map(([k, c]) => [k, c.label]),
);
const DIET_LABELS = Object.fromEntries(
  Object.entries(dietsJson.diets as Record<string, { label: string }>).map(([k, d]) => [k, d.label]),
);
const ALLERGY_TAGS = new Set(allergiesJson.rules.map((r) => r.tag));
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export type CommunityMatch = {
  slug: string;
  /** What in the profile put the person here, in the words the app shows ("Hypertension", "Gluten-free"). */
  reasons: string[];
};

/** The condition keys a profile resolves to. A condition typed as free text with no library match has none. */
export function profileConditionKeys(profile: Profile): string[] {
  const keys = new Set<string>();
  for (const c of profile.conditions) {
    const key = c.key && CONDITION_LABELS[c.key] ? c.key : conditionKey(c.name);
    if (key) keys.add(key);
  }
  return [...keys];
}

/** Every room a profile matches, with reasons. Condition groups first, then optional rooms, each in file order. */
export function matchCommunities(profile: Profile, groups: CommunityGroup[] = COMMUNITY_GROUPS): (CommunityMatch & { auto: boolean })[] {
  const conditions = new Set(profileConditionKeys(profile));
  const diets = new Set(profile.diets);
  const allergies = new Set(profile.allergies.filter((a) => ALLERGY_TAGS.has(a)));
  const out: (CommunityMatch & { auto: boolean })[] = [];
  for (const g of groups) {
    const reasons: string[] = [];
    for (const k of g.conditions ?? []) if (conditions.has(k)) reasons.push(CONDITION_LABELS[k] ?? k);
    for (const d of g.diets ?? []) if (diets.has(d)) reasons.push(DIET_LABELS[d] ?? d);
    for (const a of g.allergies ?? []) if (allergies.has(a)) reasons.push(`${capital(tagLabel(a))} allergy`);
    if (reasons.length) out.push({ slug: g.slug, reasons, auto: g.auto });
  }
  return out.sort((a, b) => Number(b.auto) - Number(a.auto));
}

/** The condition rooms a profile is placed in automatically. */
export function communitiesFor(profile: Profile, groups: CommunityGroup[] = COMMUNITY_GROUPS): CommunityMatch[] {
  return matchCommunities(profile, groups)
    .filter((m) => m.auto)
    .map(({ slug, reasons }) => ({ slug, reasons }));
}

export type Membership = { slug: string; source: "auto" | "manual" };

/**
 * What automatic placement should change. Only automatic memberships are ever removed; a room the person joined by
 * hand stays, and a room they left (an opt-out) is never re-added.
 */
export function diffMemberships(
  current: Membership[],
  target: string[],
  optOuts: string[] = [],
): { join: string[]; leave: string[] } {
  const have = new Set(current.map((m) => m.slug));
  const want = new Set(target.filter((s) => !optOuts.includes(s)));
  const join = [...want].filter((s) => !have.has(s));
  const leave = current.filter((m) => m.source === "auto" && !want.has(m.slug)).map((m) => m.slug);
  return { join, leave };
}
