import allergiesJson from "../data/rules/allergies.json";
import conditionsJson from "../data/rules/conditions.json";
import dietsJson from "../data/rules/diets.json";
import { containsTerm, normalise } from "./tagMatch";
import { isKnownTag, tagLabel } from "./tags";
import type { Profile, Rule, RuleLevel } from "./types";

const DIETS = dietsJson.diets as Record<string, { label: string; never: string[] }>;
const ALLERGY_TAGS = new Set(allergiesJson.rules.map((r) => r.tag));

type ConditionEntry = {
  label: string;
  match: string[];
  unless?: string[];
  source: { title: string; url: string };
  rules: { level: RuleLevel; tag: string; reason: string; quote: string; budget?: Rule["budget"] }[];
  note?: { text: string; quote: string };
};
const CONDITIONS = conditionsJson.conditions as Record<string, ConditionEntry>;

/** Which library condition a typed or picked condition name refers to, if any. */
export function conditionKey(name: string): string | null {
  const n = normalise(name);
  for (const [key, c] of Object.entries(CONDITIONS)) {
    if (c.unless?.some((u) => containsTerm(n, u))) continue;
    if (c.match.some((m) => containsTerm(n, m))) return key;
  }
  return null;
}

export function conditionOptions(): { key: string; label: string }[] {
  return Object.entries(CONDITIONS).map(([key, c]) => ({ key, label: c.label }));
}

export type ConditionNote = { condition: string; kind: "no_standard_rules" | "not_in_library"; text: string; source?: { title: string; url: string; quote: string } };

/** What to tell the user about conditions that produced no rules: either the source says there are none, or we have not covered it yet. */
export function conditionNotes(profile: Profile): ConditionNote[] {
  const notes: ConditionNote[] = [];
  for (const c of profile.conditions) {
    const key = c.key && CONDITIONS[c.key] ? c.key : conditionKey(c.name);
    if (!key) {
      notes.push({ condition: c.name, kind: "not_in_library", text: `We do not have sourced food rules for ${c.name} yet. You can add your own rules.` });
    } else if (CONDITIONS[key].note && !CONDITIONS[key].rules.length) {
      const e = CONDITIONS[key];
      notes.push({ condition: c.name, kind: "no_standard_rules", text: e.note!.text, source: { ...e.source, quote: e.note!.quote } });
    }
  }
  return notes;
}

/** The user's own entry is the source for allergy, diet and custom rules. */
const OWN_ENTRY = { title: "Your profile", url: "app://profile" };

const STRENGTH: Record<RuleLevel, number> = { never: 3, avoid: 2, limit: 1, keep_steady: 0 };

export function dietOptions(): { key: string; label: string }[] {
  return Object.entries(DIETS).map(([key, d]) => ({ key, label: d.label }));
}

export function allergyOptions(): { tag: string; label: string }[] {
  return [...ALLERGY_TAGS].map((tag) => ({ tag, label: tagLabel(tag) }));
}

/**
 * Turn a profile into rules: allergies, diets and conditions. Medication rules are read from FDA labels by the
 * backend (convex/medications.ts) and are not produced here.
 * When two rules land on the same tag, the stronger level wins; at the same level, one with a daily budget wins.
 */
export function compileRules(profile: Profile): Rule[] {
  const rules: Rule[] = [];
  for (const tag of profile.allergies) {
    if (!isKnownTag(tag)) continue;
    rules.push({
      id: `allergy:${tag}`,
      level: "never",
      tag,
      reason: `You listed an allergy to ${tagLabel(tag)}.`,
      source: OWN_ENTRY,
      from: { type: "allergy", label: `${tagLabel(tag)} allergy` },
      status: "library",
      enabled: true,
    });
  }
  for (const key of profile.diets) {
    const diet = DIETS[key];
    if (!diet) continue;
    for (const tag of diet.never) {
      rules.push({
        id: `diet:${key}:${tag}`,
        level: "never",
        tag,
        reason: `You follow a ${diet.label.toLowerCase()} diet.`,
        source: OWN_ENTRY,
        from: { type: "diet", label: diet.label },
        status: "library",
        enabled: true,
      });
    }
  }
  for (const c of profile.conditions) {
    const key = c.key && CONDITIONS[c.key] ? c.key : conditionKey(c.name);
    if (!key) continue;
    const entry = CONDITIONS[key];
    for (const r of entry.rules) {
      if (!isKnownTag(r.tag)) continue;
      rules.push({
        id: `cond:${key}:${r.tag}`,
        level: r.level,
        tag: r.tag,
        ...(r.budget ? { budget: r.budget } : {}),
        reason: r.reason,
        source: { ...entry.source, quote: r.quote },
        from: { type: "condition", label: c.name.trim() || entry.label },
        status: "sourced",
        enabled: true,
      });
    }
  }
  return dedupeByTag(rules);
}

export function dedupeByTag(rules: Rule[]): Rule[] {
  const best = new Map<string, Rule>();
  for (const r of rules) {
    const cur = best.get(r.tag);
    if (!cur || STRENGTH[r.level] > STRENGTH[cur.level] || (STRENGTH[r.level] === STRENGTH[cur.level] && r.budget && !cur.budget)) best.set(r.tag, r);
  }
  return [...best.values()];
}
