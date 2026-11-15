// Turning an FDA drug label into food rules, minus the network and the model.
// Code picks the candidate sentences and builds the rules; a model only chooses among numbered sentences,
// so every quote is verbatim label text by construction.

import { isKnownTag, tagLabel } from "./tags";
import type { Rule, TagId } from "./types";

/** openFDA label sections worth reading for food and drink instructions, most useful first. */
export const LABEL_SECTIONS = [
  "boxed_warning",
  "drug_interactions",
  "information_for_patients",
  "patient_medication_information",
  "spl_patient_package_insert",
  "spl_medguide",
  "warnings_and_cautions",
  "warnings",
  "precautions",
  "general_precautions",
  "contraindications",
  "dosage_and_administration",
  "do_not_use",
  "ask_doctor",
  "ask_doctor_or_pharmacist",
  "when_using",
  "stop_use",
] as const;

/** Words that make a sentence worth showing to the model. Deliberately specific: "food" alone is mostly timing advice. */
const FOOD_WORDS =
  /\b(st\.? john['’]?s wort|wort|hypericum|supplements?|antacids?|multivitamins?|vitamin [aekd]|calcium|iron|magnesium|zinc|aluminum|ginkgo|garlic|ginseng|fish oil|omega-3|echinacea|goldenseal|melatonin|biotin|niacin|coenzyme q10|turmeric|herbal|botanicals?|grapefruit|alcohol|alcoholic|beer|wine|potassium|salt substitutes?|vitamin k|tyramine|caffeine|coffee|licorice|liquorice|dairy|milk|yogurt|cheese|calcium-fortified|cranberry|sodium|salt intake|low-salt|dietary salt|leafy|green vegetables|soy|soybean|dietary fiber|walnuts?|high-protein|protein-rich|aged|fermented|pomelo|seville orange|chocolate)\b/i;

/** Bump when the way labels are read changes, so cached readings are redone. */
export const LABEL_RULES_VERSION = 2;

/** Tags a label rule may use. Foods and drinks, and supplements (matched only against scanned supplements). Allergens are the user's business, not the label's, so they are not offered. */
export const LABEL_TAGS: TagId[] = [
  "st_johns_wort", "potassium_supplement", "calcium_supplement", "iron_supplement", "magnesium_supplement", "zinc_supplement",
  "vitamin_k_supplement", "vitamin_e_supplement", "vitamin_a_supplement", "ginkgo", "garlic_supplement", "ginseng", "fish_oil",
  "echinacea", "goldenseal", "melatonin", "biotin", "niacin_supplement", "coenzyme_q10", "turmeric_supplement", "fiber_supplement",
  "grapefruit", "alcohol", "caffeine", "licorice", "leafy_greens_vitamin_k", "aged_fermented_tyramine",
  "potassium_salt_substitute", "high_potassium_food", "cranberry", "dairy", "soy", "sodium", "potassium", "fiber", "protein",
];

export function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Abbreviations whose full stop does not end a sentence. */
const ABBREVIATION = /(?:\b(?:St|Dr|Mr|Mrs|Ms|vs|approx|No|Fig|Inc|e\.g|i\.e|etc)\.)$/;

/**
 * Split label prose into sentences that are exact substrings of the collapsed text.
 * Labels run section headings into the prose ("... simvastatin. 7.2 Effects on Other Drugs ..."), so a numbered
 * heading also starts a new piece.
 */
export function sentences(text: string): string[] {
  const t = collapse(text);
  if (!t) return [];
  const parts = t.split(/(?<=[.!?])\s+(?=[A-Z(\[•]|\d+(?:\.\d+)*\s+[A-Z])/);
  const out: string[] = [];
  for (const part of parts) {
    const p = part.trim();
    if (!p) continue;
    const prev = out[out.length - 1];
    if (prev && ABBREVIATION.test(prev)) out[out.length - 1] = `${prev} ${p}`;
    else out.push(p);
  }
  return out;
}

export type LabelDoc = Record<string, unknown>;
export type Candidate = { section: string; text: string };

/**
 * The sentences from a label that mention a food or drink, in section priority order.
 * Very short fragments and very long run-ons are skipped; duplicates are removed.
 */
export function foodCandidates(label: LabelDoc, max = 60): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const section of LABEL_SECTIONS) {
    const value = label[section];
    if (!Array.isArray(value)) continue;
    for (const block of value) {
      if (typeof block !== "string") continue;
      for (const s of sentences(block)) {
        if (s.length < 25 || s.length > 420 || !FOOD_WORDS.test(s)) continue;
        const key = s.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ section, text: s });
        if (out.length >= max) return out;
      }
    }
  }
  return out;
}

/** Is this quote really in the label? Whitespace-insensitive, otherwise exact. */
export function quoteIsInLabel(label: LabelDoc, quote: string): boolean {
  const q = collapse(quote);
  if (!q) return false;
  return LABEL_SECTIONS.some((s) => {
    const value = label[s];
    return Array.isArray(value) && value.some((b) => typeof b === "string" && collapse(b).includes(q));
  });
}

export type LabelPick = { sentence: number; tag: string; level: string; reason: string };
export type LabelInfo = { rxcui: string; drugName: string; setId: string; title: string };

const LEVELS = new Set(["avoid", "limit", "keep_steady"]);
const STRENGTH: Record<string, number> = { avoid: 3, limit: 2, keep_steady: 1 };

export function dailyMedUrl(setId: string): string {
  return `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${encodeURIComponent(setId)}`;
}

/**
 * Build rules from the model's picks. A pick is kept only if its sentence number is real, its tag is one a label
 * rule may use, and its level is one a label can set. One rule per tag; the strongest level wins.
 * `label` (when given) is used to double-check the quote is in the fetched label.
 */
export function rulesFromPicks(picks: LabelPick[], candidates: Candidate[], info: LabelInfo, fromLabel: string, label?: LabelDoc): Rule[] {
  const best = new Map<string, Rule>();
  for (const p of picks) {
    const c = candidates[p.sentence - 1];
    if (!c || !Number.isInteger(p.sentence)) continue;
    if (!LABEL_TAGS.includes(p.tag) || !isKnownTag(p.tag) || !LEVELS.has(p.level)) continue;
    if (label && !quoteIsInLabel(label, c.text)) continue;
    const rule: Rule = {
      id: `med:${info.rxcui}:${p.tag}`,
      level: p.level as Rule["level"],
      tag: p.tag,
      reason: p.reason.trim() || `The ${info.drugName} label mentions ${tagLabel(p.tag)}.`,
      source: { title: info.title, url: dailyMedUrl(info.setId), quote: c.text },
      from: { type: "medication", label: fromLabel },
      status: "from_label",
      enabled: true,
    };
    const cur = best.get(p.tag);
    if (!cur || STRENGTH[rule.level] > STRENGTH[cur.level]) best.set(p.tag, rule);
  }
  return [...best.values()];
}

/** Choose the label to read from several openFDA results: single-ingredient, most food sentences, then newest. */
export function chooseLabel(results: LabelDoc[], genericName: string): LabelDoc | null {
  const want = genericName.trim().toLowerCase();
  const scored = results
    .map((r) => {
      const openfda = (r.openfda ?? {}) as Record<string, unknown>;
      const generics = Array.isArray(openfda.generic_name) ? (openfda.generic_name as unknown[]).map((g) => String(g).toLowerCase()) : [];
      const substances = Array.isArray(openfda.substance_name) ? (openfda.substance_name as unknown[]) : [];
      const single = substances.length <= 1 && generics.some((g) => g === want || g.startsWith(want + " "));
      return { r, single, n: foodCandidates(r).length, time: String(r.effective_time ?? "") };
    })
    .filter((x) => x.single && typeof x.r.set_id === "string");
  if (!scored.length) return null;
  scored.sort((a, b) => b.n - a.n || b.time.localeCompare(a.time));
  return scored[0].r;
}
