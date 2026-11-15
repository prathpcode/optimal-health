import { budgetShare, BUDGET_BANDS, percent } from "./budgets";
import { tagLabel, tagSatisfies } from "./tags";
import type { Finding, Fit, HardCheck, Item, ItemTag, Origin, Rule, Verdict } from "./types";

/** Judge probability bands per hard level. Starting values; the benchmark replaces them. */
export type Thresholds = { never: { high: number; low: number }; avoid: { high: number; low: number } };
export const DEFAULT_THRESHOLDS: Thresholds = {
  never: { high: 0.5, low: 0.1 },
  avoid: { high: 0.7, low: 0.3 },
};

/** Origins that are someone's record of what is in the item, as opposed to a guess. */
const RECORD_ORIGINS: Origin[] = ["label", "database", "restaurant"];

/** Origins whose silence can be believed: the package itself, or the restaurant's own published information. */
const COMPLETE_ORIGINS: Origin[] = ["label", "restaurant"];

/**
 * Can "nothing found" be believed for this item? Only when every ingredient was read off the package or comes from
 * the restaurant's own published information, and that source was read in full. Not for a dish read off a menu, and
 * not for a product known only from a crowd-entered database, whose records can be incomplete or out of date:
 * a database can tell us an allergen IS there, but not that it is not.
 */
export function absenceIsTrusted(item: Item): boolean {
  return !item.incomplete && item.ingredients.length > 0 && item.ingredients.every((i) => COMPLETE_ORIGINS.includes(i.origin));
}

type Vote = "yes" | "maybe" | "no" | "none";

function judgeVote(p: number | null | undefined, band: { high: number; low: number }): Vote {
  if (p === null || p === undefined || !Number.isFinite(p)) return "none";
  if (p >= band.high) return "yes";
  if (p <= band.low) return "no";
  return "maybe";
}

function readerVote(check: HardCheck | undefined, inferredTags: ItemTag[]): Vote {
  if (check && check.reader !== null) return check.reader;
  // No second pass ran: fall back to what the reader tagged on its first pass.
  if (inferredTags.some((t) => t.sureness !== "unsure")) return "yes";
  if (inferredTags.length > 0) return "maybe";
  return "none";
}

function evaluateHardRule(item: Item, rule: Rule, check: HardCheck | undefined, thresholds: Thresholds): Finding | null {
  const level = rule.level as "never" | "avoid";
  const label = tagLabel(rule.tag);
  const matching = item.tags.filter((t) => tagSatisfies(t.tag, rule.tag));

  // 1. Someone's record says it is there.
  const recorded = matching.filter((t) => RECORD_ORIGINS.includes(t.origin));
  const firm = recorded.find((t) => t.sureness !== "unsure");
  if (firm) return { ruleId: rule.id, outcome: "blocked", because: `Contains ${label}${firm.evidence ? ` ("${firm.evidence}")` : ""}.` };
  const mayContain = recorded.find((t) => t.sureness === "unsure");
  if (mayContain) {
    const because = `May contain ${label}${mayContain.evidence ? ` ("${mayContain.evidence}")` : ""}.`;
    return level === "never" ? { ruleId: rule.id, outcome: "blocked", because } : { ruleId: rule.id, outcome: "note", because };
  }

  // 2. Anyone was told "yes" by the restaurant.
  if (check?.answer?.value === "yes") return { ruleId: rule.id, outcome: "blocked", because: `The restaurant confirmed it contains ${label}.` };

  // 3. The item's own words name it.
  const statedOnMenu = matching.find((t) => (t.origin === "menu_text" || t.origin === "user") && t.sureness === "certain");
  if (check?.code === "match" || statedOnMenu) {
    return { ruleId: rule.id, outcome: "blocked", because: `Lists ${label}${statedOnMenu?.evidence ? ` ("${statedOnMenu.evidence}")` : ""}.` };
  }

  // 4. A label or database lists everything and does not list this: believe it, unless something still points
  //    at a derived or hidden form of it (an inferred tag, or a check that did not come back clean).
  const trusted = absenceIsTrusted(item);
  const packaged = item.kind !== "dish";

  // 5. Weigh the independent checks.
  const judge = judgeVote(check?.judgeP, thresholds[level]);
  const reader = readerVote(check, matching.filter((t) => t.origin === "inferred" || t.origin === "menu_text"));
  const votes = [judge, reader];
  const anyYes = votes.includes("yes");
  const anyNo = votes.includes("no");
  const anyMaybe = votes.includes("maybe") || check?.code === "hides_in";
  const userSaidNo = check?.answer?.value === "no" && check.answer.by === "this_user";

  let outcome: "blocked" | "ask" | "confirm" | null;
  if (anyYes && !anyNo && !anyMaybe) outcome = "blocked";
  else if (anyYes || anyMaybe) outcome = "ask";
  else outcome = level === "never" && !trusted ? "confirm" : null;

  if (outcome === null) return null;

  if (userSaidNo) {
    const date = check!.answer!.at.slice(0, 10);
    return { ruleId: rule.id, outcome: "note", because: `You confirmed ${packaged ? "" : "with the restaurant "}on ${date} that this has no ${label}.` };
  }
  if (outcome === "blocked") return { ruleId: rule.id, outcome, because: `Likely contains ${label}.` };
  if (outcome === "ask") {
    return {
      ruleId: rule.id,
      outcome,
      because: packaged ? `An ingredient may be a source of ${label}; the label does not say outright.` : `May contain ${label}; the menu does not say.`,
      question: packaged ? `Does ${item.name} contain ${label}? Check the full label or ask the maker.` : `Does the ${item.name} contain ${label}?`,
    };
  }
  return {
    ruleId: rule.id,
    outcome: "confirm",
    because: packaged
      ? item.ingredients.some((i) => i.origin === "database")
        ? `No ${label} found in the product database record, which can be incomplete or out of date.`
        : `No ${label} found, but the ingredient list could not be read in full.`
      : `No ${label} found in the menu text, but menus do not list everything.`,
    question: packaged ? `Check the ingredient list on the package of ${item.name} for ${label}.` : `Can you confirm the ${item.name} is prepared without ${label}?`,
  };
}

type Soft = { finding: Finding | null; penalty: number };

/** Score penalties. "against": a serving that is high in something being limited. "some": neither low nor high. */
const PENALTY = { against: 0.4, some: 0.1 };

function evaluateLimitRule(item: Item, rule: Rule): Soft {
  const label = tagLabel(rule.tag);
  const share = budgetShare(item, rule);
  if (share) {
    const basis = share.per === "serving" ? "per serving" : "per 100 g";
    const of = share.basis === "own" ? "your daily limit" : "the Daily Value";
    // The Daily Value for sugar is for ADDED sugars. A total-sugars figure (milk, fruit) is reported without judging it.
    if (share.totalSugarsAgainstAddedSugarsValue) {
      return { finding: { ruleId: rule.id, outcome: "note", because: `${Math.round(share.amount)} ${share.unit} total sugars ${basis}. The label does not say how much is added sugar.` }, penalty: 0 };
    }
    const text = `${Math.round(share.amount)} ${share.unit} ${label} ${basis}, ${percent(share.share)} of ${of}.`;
    // A per-100 g figure is not a serving, so it informs but does not count against the item.
    if (share.per !== "serving") return { finding: { ruleId: rule.id, outcome: "note", because: text }, penalty: 0 };
    if (share.share >= BUDGET_BANDS.high) return { finding: { ruleId: rule.id, outcome: "note", because: `${text} That is high.` }, penalty: PENALTY.against };
    if (share.share > BUDGET_BANDS.low) return { finding: { ruleId: rule.id, outcome: "note", because: text }, penalty: PENALTY.some };
    return { finding: { ruleId: rule.id, outcome: "note", because: `${text} That is low.` }, penalty: 0 };
  }
  const level = item.levels?.[rule.tag];
  if (level === "high") return { finding: { ruleId: rule.id, outcome: "note", because: `Likely high in ${label}.` }, penalty: PENALTY.against };
  if (level === "medium") return { finding: { ruleId: rule.id, outcome: "note", because: `Moderate in ${label}.` }, penalty: PENALTY.some };
  if (level === "low") return { finding: { ruleId: rule.id, outcome: "note", because: `Likely low in ${label}.` }, penalty: 0 };
  // No number and no level: a Limit rule on an ingredient (not a nutrient) counts when the ingredient is there.
  const present = item.tags.find((t) => tagSatisfies(t.tag, rule.tag));
  if (present) {
    const sure = present.sureness === "unsure" ? "May contain" : "Contains";
    return { finding: { ruleId: rule.id, outcome: "note", because: `${sure} ${label}, which you are limiting.` }, penalty: present.sureness === "unsure" ? PENALTY.some : PENALTY.against };
  }
  return { finding: null, penalty: 0 };
}

function evaluateKeepSteadyRule(item: Item, rule: Rule): Finding | null {
  const present = item.tags.find((t) => tagSatisfies(t.tag, rule.tag));
  if (!present) return null;
  return { ruleId: rule.id, outcome: "note", because: `Has ${tagLabel(rule.tag)}; your rules say to keep your intake steady rather than avoid it.` };
}

const ORDER: Record<Finding["outcome"], number> = { blocked: 0, ask: 1, confirm: 2, note: 3 };
export const GOOD_FIT_SCORE = 0.7;

/**
 * Apply a person's rules to one item. Pure: same inputs, same verdict.
 * `checks` are the hard-rule checks the pipeline ran; only those for this item are used, and a missing check is
 * treated as "nobody looked", never as "nothing there".
 */
export function evaluate(item: Item, rules: Rule[], checks: HardCheck[] = [], thresholds: Thresholds = DEFAULT_THRESHOLDS): Verdict {
  const findings: Finding[] = [];
  let score = 1;
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.level === "never" || rule.level === "avoid") {
      const check = checks.find((c) => c.itemId === item.id && c.ruleId === rule.id);
      const f = evaluateHardRule(item, rule, check, thresholds);
      if (f) findings.push(f);
    } else if (rule.level === "limit") {
      const s = evaluateLimitRule(item, rule);
      if (s.finding) findings.push(s.finding);
      score -= s.penalty;
    } else {
      const f = evaluateKeepSteadyRule(item, rule);
      if (f) findings.push(f);
    }
  }
  score = Math.max(0, Math.min(1, Math.round(score * 100) / 100));
  findings.sort((a, b) => ORDER[a.outcome] - ORDER[b.outcome]);

  let fit: Fit;
  if (findings.some((f) => f.outcome === "blocked")) fit = "not_fit";
  else if (findings.some((f) => f.outcome === "ask")) fit = "cant_tell";
  else fit = score >= GOOD_FIT_SCORE ? "good" : "okay";

  return fit === "not_fit" || fit === "cant_tell" ? { fit, findings } : { fit, score, findings };
}

/**
 * Add second-opinion notes from the model. They are always unsourced notes and can never change the fit:
 * this is the only way model free text enters a verdict.
 */
export function withSecondOpinion(verdict: Verdict, notes: string[]): Verdict {
  const extra: Finding[] = notes.filter((n) => n.trim()).map((n) => ({ outcome: "note", because: n.trim(), unsourced: true }));
  return { ...verdict, findings: [...verdict.findings, ...extra] };
}
