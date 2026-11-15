import synonymsJson from "../data/synonyms.json";
import hidesInJson from "../data/hidesIn.json";
import { tagSatisfies } from "./tags";
import type { Item, TagId } from "./types";

type Synonym = { term: string; unless?: string[] };
const SYNONYMS = synonymsJson.synonyms as Record<TagId, Synonym[]>;
const HIDES_IN = hidesInJson.hidesIn as Record<TagId, string[]>;

/** Lowercase, strip accents and punctuation, collapse spaces. "Crème Brûlée!" -> "creme brulee". */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9']+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Whole-word (or whole-phrase) containment, so "nut" is not found in "coconut" or "nutmeg". */
export function containsTerm(normalisedText: string, term: string): boolean {
  const t = normalise(term);
  if (!t) return false;
  return (" " + normalisedText + " ").includes(" " + t + " ");
}

function removePhrases(normalisedText: string, phrases: string[]): string {
  let out = " " + normalisedText + " ";
  for (const p of phrases) out = out.split(" " + normalise(p) + " ").join(" | ");
  return out.trim();
}

/** Tags whose literal names appear in the text. "almond milk latte" -> tree_nuts (not dairy via "milk"; dairy via "latte" is a hides-in matter). */
export function literalTags(text: string): { tag: TagId; term: string }[] {
  const n = normalise(text);
  const found: { tag: TagId; term: string }[] = [];
  for (const [tag, entries] of Object.entries(SYNONYMS)) {
    for (const e of entries) {
      const haystack = e.unless?.length ? removePhrases(n, e.unless) : n;
      if (containsTerm(haystack, e.term)) {
        found.push({ tag, term: e.term });
        break;
      }
    }
  }
  return found;
}

/** Tags that commonly hide in something named in the text. Only ever a reason to ask. */
export function hidesInTags(text: string): { tag: TagId; term: string }[] {
  const n = normalise(text);
  const found: { tag: TagId; term: string }[] = [];
  for (const [tag, terms] of Object.entries(HIDES_IN)) {
    const term = terms.find((t) => containsTerm(n, t));
    if (term) found.push({ tag, term });
  }
  return found;
}

/** The hides-in terms for one tag, for putting in front of the judge. */
export function hidesInTerms(tag: TagId): string[] {
  return HIDES_IN[tag] ?? [];
}

export type CodeCheck = { result: "match" | "hides_in" | "no_match"; term?: string };

/**
 * The code half of a hard-rule check for one item and one tag.
 * "match": the item's own words name the tagged thing. "hides_in": they name something that commonly contains it.
 * Inferred ingredients are a model's guess, so they are not read here; they reach the evaluator through item.tags.
 */
export function codeCheck(item: Item, tag: TagId): CodeCheck {
  const stated = [item.name, item.description ?? "", ...item.ingredients.filter((i) => i.origin !== "inferred").map((i) => i.name)];
  for (const text of stated) {
    const hit = literalTags(text).find((h) => tagSatisfies(h.tag, tag));
    if (hit) return { result: "match", term: hit.term };
  }
  for (const text of stated) {
    const hit = hidesInTags(text).find((h) => tagSatisfies(h.tag, tag));
    if (hit) return { result: "hides_in", term: hit.term };
  }
  return { result: "no_match" };
}
