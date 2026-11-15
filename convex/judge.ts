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

/**
 * For the shelf view: of several database records, which is the same product as a package whose front has been
 * read? One yes/no question per candidate, all in one request. Returns a probability per candidate, or null when
 * the judge is not configured or the call fails (the caller then relies on its own word matching).
 */
export async function judgeSameProduct(front: { brand: string; name: string; variety: string }, candidates: { brand?: string; name: string }[]): Promise<number[] | null> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key || !candidates.length) return null;
  const questions: Record<string, unknown> = {};
  candidates.forEach((_, i) => {
    questions[`q${i}`] = {
      type: "noul",
      instructions: `Is \`candidates[${i}]\` the same product as \`package\`, including the same flavour or variety?`,
      criteria: {
        true: "Same maker or range, same product, and the same flavour or variety. Differences in spelling, word order, size or wording such as 'soup' being added do not matter.",
        false: "A different product, a different maker, or a different flavour or variety of the same range.",
      },
    };
  });
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.JUDGE_MODEL || "jev-latest", state: { package: front, candidates: candidates.map((c) => ({ brand: c.brand ?? "", name: c.name })) }, questions }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`judge HTTP ${res.status}`);
    const data = (await res.json()) as { answers?: Record<string, { noul?: number }> };
    const ps = candidates.map((_, i) => data.answers?.[`q${i}`]?.noul);
    return ps.every((p) => typeof p === "number" && Number.isFinite(p)) ? (ps as number[]) : null;
  } catch (e) {
    console.error("judge call failed", e);
    return null;
  }
}

export type Scene = {
  /** How sure the judge is that a packaged food or drink product is in the picture. */
  present: number;
  count: "none" | "one" | "several";
  /** Where the most prominent product is, as fractions of the picture, and how sure the judge is of it. */
  box: { top: number; left: number; bottom: number; right: number };
  boxConfidence: number;
};

/**
 * What the camera is pointed at, from the picture itself: no packaged product, one, or several, and where the most
 * prominent one is. About a fifth of a second. The judge's picture reading is still marked experimental by its
 * maker, so this is only ever used to decide what to look at more closely, never to decide a verdict. Null when the
 * judge is not configured or the call fails; the caller then falls back on the shape of the text.
 */
export async function judgeScene(imageBase64: string): Promise<Scene | null> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "TypeSafe-Danger-Zone-Images": "true" },
      body: JSON.stringify({
        model: process.env.JUDGE_MODEL || "jev-latest",
        state: { photo: "photo-1" },
        assets: { "photo-1": { type: "image", format: "jpg", data_base64: imageBase64 } },
        questions: {
          present: { type: "noul", instructions: "Does `photo` show at least one packaged food or drink product (a can, bottle, box, bag, jar or wrapper with a brand on it)?" },
          count: {
            type: "choice",
            instructions: "How many packaged food or drink products are clearly visible in `photo`?",
            criteria: { none: "No packaged food or drink product.", one: "Exactly one, or one that clearly dominates the picture.", several: "Two or more side by side, such as a shop shelf." },
          },
          where: { type: "box", instructions: "The most prominent packaged food or drink product in `photo`." },
        },
      }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`judge HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const a = ((await res.json()) as { answers?: Record<string, { noul?: number; choice?: string; box?: Scene["box"]; confidence?: number | null }> }).answers ?? {};
    const count = a.count?.choice;
    const box = a.where?.box;
    if (typeof a.present?.noul !== "number" || (count !== "none" && count !== "one" && count !== "several") || !box) return null;
    return { present: a.present.noul, count, box, boxConfidence: a.where?.confidence ?? 0 };
  } catch (e) {
    console.error("judge scene failed", e);
    return null;
  }
}
