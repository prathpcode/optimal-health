import { v } from "convex/values";
import { action } from "./_generated/server";
import { allergyOptions, conditionOptions, dietOptions } from "../engine/compileRules";

// Autocomplete for the setup screens, from the U.S. National Library of Medicine's Clinical Tables service.
// Only the typed search term leaves the backend; nothing about the user is sent.
const BASE = "https://clinicaltables.nlm.nih.gov/api";

async function search(path: string, term: string): Promise<unknown> {
  const t = term.trim();
  if (t.length < 2) return null;
  const res = await fetch(`${BASE}/${path}/v3/search?maxList=8&terms=${encodeURIComponent(t)}`);
  if (!res.ok) return null;
  return await res.json();
}

/** Medication suggestions for what the user has typed so far. Name only: no dose, no form. */
export const medications = action({
  args: { term: v.string() },
  handler: async (_ctx, { term }): Promise<{ name: string }[]> => {
    const data = await search("rxterms", term);
    if (!Array.isArray(data) || !Array.isArray(data[1])) return [];
    const names = (data[1] as unknown[])
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.replace(/\s*\([^)]*\)\s*$/, "").trim()); // "Lisinopril (Oral Pill)" -> "Lisinopril"
    return [...new Set(names)].map((name) => ({ name }));
  },
});

/** Condition suggestions for what the user has typed so far. */
export const conditions = action({
  args: { term: v.string() },
  handler: async (_ctx, { term }): Promise<{ name: string }[]> => {
    const data = await search("conditions", term);
    if (!Array.isArray(data) || !Array.isArray(data[3])) return [];
    const names = (data[3] as unknown[]).map((row) => (Array.isArray(row) && typeof row[0] === "string" ? row[0] : "")).filter(Boolean);
    return [...new Set(names)].map((name) => ({ name }));
  },
});

/** The fixed choices for the allergy, diet and common-condition chips. Conditions listed here have sourced rules. */
export const options = action({
  args: {},
  handler: async (): Promise<{
    allergies: { tag: string; label: string }[];
    diets: { key: string; label: string }[];
    conditions: { key: string; label: string }[];
  }> => ({ allergies: allergyOptions(), diets: dietOptions(), conditions: conditionOptions() }),
});
