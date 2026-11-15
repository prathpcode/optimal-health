// Pure steps of the scan pipeline: everything between "a model said this" and "the scan record says this".
// The network calls live in convex/; the decisions live here so they can be tested.

import { evaluate, withSecondOpinion, type Thresholds } from "./evaluate";
import { applyRemembered, dishKey, type RememberedAnswer } from "./memory";
import { withLabelFindings } from "./otc";
import { codeCheck, containsTerm, literalTags, normalise } from "./tagMatch";
import { isKnownTag, tagInfo, tagLabel, tagSatisfies } from "./tags";
import type { HardCheck, Item, ItemTag, RankedItem, Rule, ScanQuestion, Sureness, Verdict } from "./types";

// ---- What the reader model returns for a menu ----

export type ReaderDish = {
  name: string;
  description: string;
  ingredients: { name: string; stated: boolean; evidence: string }[];
  tags: { tag: string; sureness: Sureness; evidence: string }[];
  levels: { nutrient: string; level: "low" | "medium" | "high" }[];
};

/** The dish's own words, as the reader transcribed them. Evidence has to be found in here. */
function dishText(d: ReaderDish): string {
  return normalise(`${d.name} ${d.description}`);
}

/**
 * Turn reader output into Items, enforcing "no evidence, no tag":
 * - a tag is kept only if its evidence is words that appear in the dish's name or description;
 * - an ingredient marked "stated" is believed only if its evidence does too; otherwise it is treated as inferred;
 * - a tag is "menu_text / certain" only when code finds the ingredient's literal name; the model's own
 *   confidence can make an inferred tag at most "likely".
 * Unknown tag ids are dropped.
 */
export function itemsFromReader(dishes: ReaderDish[], idPrefix = "d"): Item[] {
  return dishes.map((d, i) => {
    const text = dishText(d);
    const found = (evidence: string) => !!evidence.trim() && containsTerm(text, evidence);
    const literal = literalTags(`${d.name} ${d.description}`);

    const ingredients = d.ingredients
      .filter((ing) => ing.name.trim())
      .map((ing) => {
        const stated = ing.stated && found(ing.evidence);
        return stated
          ? { name: ing.name.trim(), origin: "menu_text" as const, evidence: ing.evidence.trim() }
          : { name: ing.name.trim(), origin: "inferred" as const };
      });

    const tags = new Map<string, ItemTag>();
    // Code's own literal reading comes first and is certain.
    for (const hit of literal) tags.set(hit.tag, { tag: hit.tag, sureness: "certain", origin: "menu_text", evidence: hit.term });
    for (const t of d.tags) {
      if (!isKnownTag(t.tag) || tags.has(t.tag)) continue;
      if (tagInfo(t.tag)?.group === "nutrient") continue; // nutrients travel as levels, not tags
      if (!found(t.evidence)) continue; // no evidence, no tag
      tags.set(t.tag, { tag: t.tag, sureness: t.sureness === "certain" ? "likely" : t.sureness, origin: "inferred", evidence: t.evidence.trim() });
    }

    const levels: Record<string, "low" | "medium" | "high"> = {};
    for (const l of d.levels) if (tagInfo(l.nutrient)?.group === "nutrient") levels[l.nutrient] = l.level;

    return {
      id: `${idPrefix}${i + 1}`,
      kind: "dish" as const,
      name: d.name.trim(),
      ...(d.description.trim() ? { description: d.description.trim() } : {}),
      ingredients,
      tags: [...tags.values()],
      ...(Object.keys(levels).length ? { levels } : {}),
    };
  });
}

export function hardRules(rules: Rule[]): Rule[] {
  return rules.filter((r) => r.enabled && (r.level === "never" || r.level === "avoid"));
}

export type ReaderOpinion = { itemId: string; tag: string; answer: "yes" | "maybe" | "no" };
export type JudgeOpinion = { itemId: string; ruleId: string; p: number };

/** One HardCheck per item per hard rule, from code plus whatever the models said. Missing opinions stay null. */
export function buildChecks(items: Item[], rules: Rule[], reader: ReaderOpinion[] = [], judge: JudgeOpinion[] = []): HardCheck[] {
  const checks: HardCheck[] = [];
  for (const item of items) {
    for (const rule of hardRules(rules)) {
      const r = reader.find((o) => o.itemId === item.id && tagSatisfies(o.tag, rule.tag));
      const j = judge.find((o) => o.itemId === item.id && o.ruleId === rule.id);
      checks.push({
        itemId: item.id,
        ruleId: rule.id,
        code: codeCheck(item, rule.tag).result,
        judgeP: j && Number.isFinite(j.p) ? Math.max(0, Math.min(1, j.p)) : null,
        reader: r ? r.answer : null,
      });
    }
  }
  return checks;
}

export function buildVerdicts(items: Item[], rules: Rule[], checks: HardCheck[], thresholds?: Thresholds): Record<string, Verdict> {
  const out: Record<string, Verdict> = {};
  for (const item of items) out[item.id] = evaluate(item, rules, checks, thresholds);
  return out;
}

/**
 * Questions for the "Ask your server" list: one per "ask" finding. "Confirm" findings stay on each dish (a
 * standing reminder, not a question to put to the server about all twelve dishes). Ruled-out items are skipped.
 */
export function buildQuestions(items: Item[], verdicts: Record<string, Verdict>): ScanQuestion[] {
  const qs: ScanQuestion[] = [];
  for (const item of items) {
    if (verdicts[item.id]?.fit === "not_fit") continue;
    for (const f of verdicts[item.id]?.findings ?? []) {
      if (f.outcome === "ask" && f.ruleId && f.question) {
        qs.push({ id: `q:${item.id}:${f.ruleId}`, itemId: item.id, ruleId: f.ruleId, text: f.question });
      }
    }
  }
  return qs;
}

const SECTION: Record<Verdict["fit"], RankedItem["section"]> = { good: "best", okay: "okay", cant_tell: "cant_tell", not_fit: "not_fit" };
const SECTION_ORDER: RankedItem["section"][] = ["best", "okay", "cant_tell", "not_fit"];

/** The one-line reason code writes when no model line is available (and always for blocked items). */
export function defaultLine(verdict: Verdict, rules: Rule[]): string {
  const f = verdict.findings.find((x) => !x.unsourced);
  if (!f) return verdict.fit === "good" ? "Nothing in your rules against it." : "";
  const rule = rules.find((r) => r.id === f.ruleId);
  if (f.source && f.about) return f.outcome === "blocked" ? `Label says do not use (${f.about}).` : `Ask your pharmacist (${f.about}).`;
  if (f.outcome === "blocked" && rule) return `${capitalise(tagLabel(rule.tag))} (${rule.from.label}).`;
  if (f.outcome === "confirm" && rule) return `Confirm no ${tagLabel(rule.tag)}.`;
  return f.because;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export type ModelRanking = { itemId: string; line: string; modification?: string }[];

/**
 * Build the ranked list. The section an item sits in comes only from its verdict, so a model cannot promote a
 * blocked dish. The model may order items within a section and word the line for unblocked items; blocked items
 * always get the code-written line. Items the model forgot are appended; ids it invented are ignored.
 */
export function buildRanking(items: Item[], verdicts: Record<string, Verdict>, rules: Rule[], model: ModelRanking = []): RankedItem[] {
  const modelPos = new Map(model.map((m, i) => [m.itemId, i]));
  const rows = items.map((item, i) => {
    const v = verdicts[item.id];
    const m = model.find((x) => x.itemId === item.id);
    const blocked = v.fit === "not_fit";
    const line = (!blocked && m?.line.trim()) || defaultLine(v, rules);
    const row: RankedItem = { itemId: item.id, section: SECTION[v.fit], line };
    if (!blocked && m?.modification?.trim()) row.modification = m.modification.trim();
    return { row, key: [SECTION_ORDER.indexOf(SECTION[v.fit]), -(v.score ?? 0), modelPos.get(item.id) ?? Number.MAX_SAFE_INTEGER, i] };
  });
  rows.sort((a, b) => {
    for (let k = 0; k < a.key.length; k++) if (a.key[k] !== b.key[k]) return a.key[k] - b.key[k];
    return 0;
  });
  return rows.map((r) => r.row);
}

/** Attach the model's unsourced second-opinion notes. They never change a verdict's fit. */
export function applySecondOpinions(verdicts: Record<string, Verdict>, notes: { itemId: string; note: string }[]): Record<string, Verdict> {
  const out: Record<string, Verdict> = { ...verdicts };
  for (const id of Object.keys(out)) {
    const mine = notes.filter((n) => n.itemId === id).map((n) => n.note);
    if (mine.length) out[id] = withSecondOpinion(out[id], mine);
  }
  return out;
}

/** Record an answer to a question on the matching check. Returns new checks; the caller re-evaluates. */
export function applyAnswer(checks: HardCheck[], question: ScanQuestion, value: "yes" | "no", at: string): HardCheck[] {
  return checks.map((c) =>
    c.itemId === question.itemId && c.ruleId === question.ruleId ? { ...c, answer: { value, by: "this_user" as const, at } } : c,
  );
}

/**
 * Re-evaluate a finished scan after an answer. Verdicts are recomputed from items + rules + checks; the model's
 * unsourced notes, wording and ordering are carried over, but sections follow the new verdicts.
 */
export function afterAnswer(
  scan: StoredScan,
  rules: Rule[],
  questionId: string,
  value: "yes" | "no" | "skipped",
  at: string,
): Reevaluated | null {
  const question = scan.questions.find((q) => q.id === questionId);
  if (!question) return null;
  const checks = value === "skipped" ? scan.checks : applyAnswer(scan.checks, question, value, at);
  const answers = new Map(scan.questions.map((q) => [q.id, q.answer]));
  answers.set(questionId, value);
  return reevaluate(scan, rules, checks, answers);
}

type StoredScan = { items: Item[]; checks: HardCheck[]; verdicts: Record<string, Verdict>; ranking: RankedItem[]; questions: ScanQuestion[] };
type Reevaluated = { checks: HardCheck[]; verdicts: Record<string, Verdict>; ranking: RankedItem[]; questions: ScanQuestion[] };

/**
 * Recompute a finished scan from items + rules + the given checks. The model's unsourced notes, wording and ordering
 * are carried over, but sections follow the new verdicts.
 */
function reevaluate(scan: StoredScan, rules: Rule[], checks: HardCheck[], answers: Map<string, ScanQuestion["answer"]>): Reevaluated {
  let verdicts = buildVerdicts(scan.items, rules, checks);
  // Findings from a product's own label (package warnings, an ingredient already taken) do not come from rules,
  // so recomputing from rules would drop them. Carry them over; they can only keep the verdict cautious.
  for (const [itemId, old] of Object.entries(scan.verdicts)) {
    const fromLabel = old.findings.filter((f) => f.source && !f.ruleId && !f.unsourced);
    if (fromLabel.length && verdicts[itemId]) verdicts[itemId] = withLabelFindings(verdicts[itemId], fromLabel);
  }
  const notes = Object.entries(scan.verdicts).flatMap(([itemId, v]) =>
    v.findings.filter((f) => f.unsourced).map((f) => ({ itemId, note: f.because })),
  );
  verdicts = applySecondOpinions(verdicts, notes);
  const ranking = buildRanking(scan.items, verdicts, rules, scan.ranking);
  // Keep answered questions on the list (the app shows them as answered) and add any still open.
  const open = buildQuestions(scan.items, verdicts);
  const kept = scan.questions.filter((q) => answers.get(q.id) && !open.some((o) => o.id === q.id));
  const questions = [...open, ...kept].map((q) => (answers.get(q.id) ? { ...q, answer: answers.get(q.id) } : q));
  return { checks, verdicts, ranking, questions };
}

/** The checks whose answer was given on this scan (through one of its questions), as opposed to remembered from an earlier visit. */
function answeredHere(scan: Pick<StoredScan, "questions">, c: HardCheck): boolean {
  const q = scan.questions.find((x) => x.itemId === c.itemId && x.ruleId === c.ruleId);
  return q?.answer === "yes" || q?.answer === "no";
}

/**
 * Re-evaluate a finished scan once it is known, or corrected, which restaurant it is from. What that restaurant has
 * told people before is attached to the checks, exactly as the pipeline does for a scan that knew its restaurant
 * from the start. Answers given on this scan are kept; answers that were remembered from another restaurant (the
 * scan was first matched to the wrong place) are dropped, since they were never about this one.
 */
export function afterRestaurant(scan: StoredScan, rules: Rule[], remembered: RememberedAnswer[], deviceId: string, now: Date): Reevaluated {
  const own = scan.checks.map((c) => {
    if (!c.answer || answeredHere(scan, c)) return c;
    const { answer: _dropped, ...rest } = c;
    return rest;
  });
  const checks = applyRemembered(own, scan.items, rules, remembered, deviceId, now);
  return reevaluate(scan, rules, checks, new Map(scan.questions.map((q) => [q.id, q.answer])));
}

/**
 * The answers this person gave on this scan, in the form they are remembered per restaurant. Used when a scan gets
 * its restaurant only after questions were answered, so those answers are not lost. Answers that were themselves
 * remembered from an earlier visit are left out: they are already stored, against the restaurant they were about.
 */
export function answersToRemember(scan: Pick<StoredScan, "items" | "checks" | "questions">, rules: Rule[]): Omit<RememberedAnswer, "deviceId">[] {
  const out: Omit<RememberedAnswer, "deviceId">[] = [];
  for (const c of scan.checks) {
    if (c.answer?.by !== "this_user" || !answeredHere(scan, c)) continue;
    const item = scan.items.find((i) => i.id === c.itemId);
    const rule = rules.find((r) => r.id === c.ruleId);
    if (item && rule) out.push({ dishKey: dishKey(item), tag: rule.tag, value: c.answer.value, at: c.answer.at });
  }
  return out;
}
