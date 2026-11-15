// The person's own rules: which levels a tag can take, and what adding one would replace. Pure.

import { tagInfo } from "./tags";
import type { Rule, RuleLevel, TagId } from "./types";

/** Strongest first. */
const STRENGTH: Record<RuleLevel, number> = { never: 3, avoid: 2, limit: 1, keep_steady: 0 };

/**
 * The levels a person can choose for a rule of their own. A nutrient (sodium, sugar) is something a food always has
 * some of, so it can only be limited; anything else can be ruled out, avoided or limited.
 */
export function customLevelsFor(tag: TagId): RuleLevel[] {
  const info = tagInfo(tag);
  if (!info) return [];
  return info.group === "nutrient" ? ["limit"] : ["never", "avoid", "limit"];
}

export type CustomRuleCheck = {
  /** Rules already on this tag. Adding the custom rule replaces all of them. */
  replaces: Rule[];
  /**
   * A switched-on rule from the profile (an allergy, a medicine's label, a condition, a diet) that is stronger than
   * the level asked for. Replacing it would quietly loosen a rule the person did not write, so it is not allowed:
   * they can switch that rule off themselves if that is what they mean.
   */
  weakens: Rule | null;
};

/** What adding a custom rule on `tag` at `level` would do to the rules the person already has. */
export function checkCustomRule(rules: (Rule & { custom?: boolean })[], tag: TagId, level: RuleLevel): CustomRuleCheck {
  const replaces = rules.filter((r) => r.tag === tag);
  const weakens =
    replaces
      .filter((r) => !r.custom && r.enabled && STRENGTH[r.level] > STRENGTH[level])
      .sort((a, b) => STRENGTH[b.level] - STRENGTH[a.level])[0] ?? null;
  return { replaces, weakens };
}
