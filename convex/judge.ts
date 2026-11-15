// The judge: Jev (TypeSafe), a decision model that answers narrow yes/no questions with a probability.
// Optional at runtime. With no TYPESAFE_API_KEY, or if a call fails, it returns no opinions and the evaluator
// decides on code and the reader alone (a null judge result in engine/evaluate.ts).
//
// What Jev is given: one dish or product at a time, as text, plus our own "commonly hides in" notes. It judges that
// state; it is not asked to supply food knowledge of its own, and it never sees the photo or the user's profile.

import { hidesInTerms } from "../engine/tagMatch";
import { tagLabel } from "../engine/tags";
import type { JudgeOpinion } from "../engine/pipeline";
import type { Item, Rule } from "../engine/types";

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const CONCURRENCY = 12;

/**
 * Two separate switches.
 * - With a key set, the judge gives the fast first pass: provisional verdicts shown while the careful check runs.
 * - Only with JUDGE_ENABLED=true does it also feed the FINAL verdict. That is off by default: on the first benchmark
 *   it caught nothing the per-rule second pass had not already caught, added a few needless flags, and its low
 *   probabilities were not safe to act on (real allergen cases scored as low as 0.02). See bench/reports/.
 */
export function judgeAvailable(): boolean {
  return !!process.env.TYPESAFE_API_KEY;
}

export function judgeEnabledForScans(): boolean {
  return judgeAvailable() && process.env.JUDGE_ENABLED === "true";
}

function stateFor(item: Item, rules: Rule[]): Record<string, unknown> {
  const stated = item.ingredients.filter((i) => i.origin !== "inferred").map((i) => i.name);
  const typical = item.ingredients.filter((i) => i.origin === "inferred").map((i) => i.name);
  const notes: Record<string, string> = {};
  for (const r of rules) {
    const terms = hidesInTerms(r.tag);
    if (terms.length) notes[tagLabel(r.tag)] = `Commonly found in: ${terms.slice(0, 20).join(", ")}.`;
  }
  return item.kind === "dish"
    ? { dish: { name: item.name, menu_description: item.description ?? "", ingredients_named_on_menu: stated, ingredients_typical_for_this_dish: typical }, background: notes }
    : { product: { name: item.name, ingredient_list: stated }, background: notes };
}

function questionFor(item: Item, rule: Rule): Record<string, unknown> {
  const label = tagLabel(rule.tag);
  return item.kind === "dish"
    ? {
        type: "noul",
        instructions: `Does the dish in \`dish\`, as a restaurant would normally prepare it, contain ${label} or is it commonly prepared with ${label}?`,
        criteria: {
          true: `The dish names ${label}, or a typical preparation of this dish includes ${label}, including in a sauce, garnish, stock, dressing or topping.`,
          false: `Nothing in the dish's name, description or typical ingredients involves ${label}.`,
        },
      }
    : {
        type: "noul",
        instructions: `Does any ingredient in \`product.ingredient_list\` contain ${label} or is any ingredient made from ${label}?`,
        criteria: {
          true: `At least one listed ingredient is ${label} or is derived from ${label}, even under another name.`,
          false: `No listed ingredient is ${label} or derived from ${label}.`,
        },
      };
}

async function judgeOne(item: Item, rules: Rule[], key: string): Promise<JudgeOpinion[]> {
  const questions: Record<string, unknown> = {};
  rules.forEach((r, i) => (questions[`q${i}`] = questionFor(item, r)));
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.JUDGE_MODEL || "jev-latest", state: stateFor(item, rules), questions }),
  });
  if (!res.ok) throw new Error(`judge HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { answers?: Record<string, { noul?: number }> };
  const out: JudgeOpinion[] = [];
  rules.forEach((r, i) => {
    const p = data.answers?.[`q${i}`]?.noul;
    if (typeof p === "number" && Number.isFinite(p)) out.push({ itemId: item.id, ruleId: r.id, p });
  });
  return out;
}

/** One request per item, one yes/no question per hard rule. Items whose call fails simply get no opinion. */
export async function judgeItems(items: Item[], hard: Rule[]): Promise<JudgeOpinion[]> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key || !hard.length || !items.length) return [];
  const out: JudgeOpinion[] = [];
  let next = 0;
  let failures = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        out.push(...(await judgeOne(item, hard, key)));
      } catch (e) {
        if (failures++ === 0) console.error("judge call failed", e);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return out;
}
