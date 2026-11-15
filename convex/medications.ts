"use node";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import { internalAction, type ActionCtx } from "./_generated/server";
import { chooseLabel, foodCandidates, LABEL_TAGS, rulesFromPicks, type LabelDoc } from "../engine/labelRules";
import { tagLabel } from "../engine/tags";
import type { MedicationStatus, Profile, Rule } from "../engine/types";

// What leaves the backend here: a drug name to the U.S. National Library of Medicine (RxNorm) and to openFDA, and
// label sentences to the model. Nothing identifying the user.

type Ingredient = { rxcui: string; name: string };

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  return await res.json();
}

/** Typed name (brand or generic, possibly misspelt) -> its active ingredient(s). */
export async function ingredientsFor(name: string): Promise<Ingredient[]> {
  const q = encodeURIComponent(name.trim());
  let id: string | undefined = (await getJson(`https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${q}&search=2`))?.idGroup?.rxnormId?.[0];
  if (!id) {
    const approx = await getJson(`https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${q}&maxEntries=1&option=1`);
    id = approx?.approximateGroup?.candidate?.[0]?.rxcui;
  }
  if (!id) return [];
  const related = await getJson(`https://rxnav.nlm.nih.gov/REST/rxcui/${id}/related.json?tty=IN`);
  const props = related?.relatedGroup?.conceptGroup?.flatMap((g: any) => g.conceptProperties ?? []) ?? [];
  return props.filter((p: any) => p?.rxcui && p?.name).map((p: any) => ({ rxcui: String(p.rxcui), name: String(p.name) }));
}

async function labelFor(ingredient: string): Promise<LabelDoc | null> {
  const search = encodeURIComponent(`openfda.generic_name:"${ingredient}"`);
  const data = await getJson(`https://api.fda.gov/drug/label.json?search=${search}&limit=8`);
  const results: LabelDoc[] = Array.isArray(data?.results) ? data.results : [];
  return chooseLabel(results, ingredient);
}

const PickSchema = z.object({
  picks: z.array(
    z.object({
      sentence: z.number(),
      tag: z.enum(LABEL_TAGS as [string, ...string[]]),
      level: z.enum(["avoid", "limit", "keep_steady"]),
      reason: z.string(),
    }),
  ),
});

const PICK_SYSTEM = `You are given numbered sentences copied word for word from the FDA label of one medicine.
Pick the sentences that tell or warn the patient about consuming a specific food, drink, nutrient, or dietary/herbal
supplement while taking it.

For each sentence you pick, return:
- sentence: its number.
- tag: the food, drink, nutrient or supplement it is about, from the list given. If a sentence names several
  (for example a list of herbal products), return one pick per tag, each with the same sentence number.
- level:
  - "avoid": the label says not to have it, or to avoid it.
  - "limit": the label says to limit or moderate it, to use caution, or that large or excessive amounts are the problem.
    Also use "limit" when the instruction is conditional: only at the same time as the dose, only on its own, only in large amounts.
  - "keep_steady": the label says to keep intake consistent rather than avoid it.
- reason: one plain sentence that only restates what the label sentence says, naming the medicine, e.g.
  "The simvastatin label says to avoid grapefruit juice." No advice of your own.

Do not pick a sentence that is only about:
- other prescription or over-the-counter medicines (potassium-sparing diuretics, antibiotics, NSAIDs). Dietary and herbal
  supplements, vitamins, minerals and antacids DO count when one of the tags fits, as do foods and salt substitutes.
- blood test values or side effects (low sodium, high potassium levels) with no instruction about eating or drinking.
- what the product itself contains (alcohol or lactose as an ingredient of the medicine).
- study results with no instruction, or timing advice such as "take with or without food".
- overdose, abuse or dependence.
If the same instruction appears in several sentences, pick the clearest one. If nothing qualifies, return an empty list.
Stay strictly within what the sentences say. Do not use what you know about the medicine from elsewhere.`;

/** Read one ingredient's label into rule templates (from.label is the ingredient name; callers relabel). */
async function readLabel(client: Anthropic, ing: Ingredient): Promise<{ outcome: "rules" | "no_food_rules" | "no_label"; setId?: string; rules: Rule[] }> {
  const label = await labelFor(ing.name);
  if (!label) return { outcome: "no_label", rules: [] };
  const setId = String(label.set_id);
  const candidates = foodCandidates(label);
  if (!candidates.length) return { outcome: "no_food_rules", setId, rules: [] };
  const response = await client.messages.parse({
    model: process.env.READER_MODEL || "claude-opus-5-5",
    max_tokens: 8000,
    system: PICK_SYSTEM,
    messages: [
      {
        role: "user",
        content:
          `Medicine: ${ing.name}\n\nTags you may use:\n${LABEL_TAGS.map((t) => `- ${t}: ${tagLabel(t)}`).join("\n")}\n\n` +
          `Sentences:\n${candidates.map((c, i) => `${i + 1}. [${c.section}] ${c.text}`).join("\n")}`,
      },
    ],
    output_config: { effort: "medium", format: zodOutputFormat(PickSchema) },
  });
  const picks = response.stop_reason === "refusal" ? [] : (response.parsed_output?.picks ?? []);
  const title = `${ing.name.charAt(0).toUpperCase()}${ing.name.slice(1)} label (FDA, via DailyMed)`;
  const rules = rulesFromPicks(picks, candidates, { rxcui: ing.rxcui, drugName: ing.name, setId, title }, ing.name, label);
  return { outcome: rules.length ? "rules" : "no_food_rules", setId, rules };
}

/** Rules for one typed medication name, using the cache where possible. */
async function rulesForName(ctx: ActionCtx, client: Anthropic, typed: string): Promise<{ ingredients: Ingredient[]; rules: Rule[]; notes: string[]; noLabel: boolean }> {
  const ingredients = await ingredientsFor(typed);
  const rules: Rule[] = [];
  const notes: string[] = [];
  let labelsFound = 0;
  if (!ingredients.length) notes.push(`"${typed}" was not recognised as a medicine.`);
  for (const ing of ingredients) {
    let entry: { outcome: string; rules: Rule[] } | null = await ctx.runQuery(internal.drugRules.cached, { rxcui: ing.rxcui });
    if (!entry) {
      const read = await readLabel(client, ing);
      await ctx.runMutation(internal.drugRules.store, {
        rxcui: ing.rxcui, drugName: ing.name, outcome: read.outcome, rules: read.rules, ...(read.setId ? { setId: read.setId } : {}),
      });
      entry = read;
    }
    if (entry.outcome === "no_label") notes.push(`No FDA label was found for ${ing.name}.`);
    else labelsFound++;
    for (const r of entry.rules) rules.push({ ...r, from: { type: "medication", label: typed.trim() } });
  }
  return { ingredients, rules, notes, noLabel: ingredients.length > 0 && labelsFound === 0 };
}

/** Background step after a profile save: read the labels for the profile's medications and write their rules. */
export const compile = internalAction({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }): Promise<null> => {
    const profile: Profile | null = await ctx.runQuery(internal.drugRules.profileFor, { deviceId });
    if (!profile) return null;
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("medications.compile: no ANTHROPIC_API_KEY set; medication rules were not read");
      await ctx.runMutation(internal.drugRules.setForDevice, {
        deviceId, results: profile.medications.map((m) => m.name.trim()).filter(Boolean).map((name) => ({ name, state: "failed" as const, rules: [] })),
      });
      return null;
    }
    const client = new Anthropic();
    const results: { name: string; state: MedicationStatus["state"]; rules: Rule[] }[] = await Promise.all(
      profile.medications.map((m) => m.name.trim()).filter(Boolean).map(async (name) => {
        try {
          const out = await rulesForName(ctx, client, name);
          const state: MedicationStatus["state"] = !out.ingredients.length ? "not_recognised" : out.rules.length ? "rules" : out.noLabel ? "no_label" : "no_rules";
          return { name, state, rules: out.rules };
        } catch (e) {
          console.error(`reading the label for ${name} failed`, e);
          return { name, state: "failed" as const, rules: [] };
        }
      }),
    );
    await ctx.runMutation(internal.drugRules.setForDevice, { deviceId, results });
    return null;
  },
});

/** For trying a medicine from the command line: `npx convex run medications:preview '{"name":"zocor"}'`. */
export const preview = internalAction({
  args: { name: v.string(), fresh: v.optional(v.boolean()) },
  handler: async (ctx, { name, fresh }): Promise<{ ingredients: Ingredient[]; notes: string[]; rules: { level: string; tag: string; reason: string; quote?: string; url: string }[] }> => {
    const client = new Anthropic();
    if (fresh) {
      for (const ing of await ingredientsFor(name)) {
        const read = await readLabel(client, ing);
        await ctx.runMutation(internal.drugRules.store, { rxcui: ing.rxcui, drugName: ing.name, outcome: read.outcome, rules: read.rules, ...(read.setId ? { setId: read.setId } : {}) });
      }
    }
    const out = await rulesForName(ctx, client, name);
    return { ingredients: out.ingredients, notes: out.notes, rules: out.rules.map((r) => ({ level: r.level, tag: r.tag, reason: r.reason, quote: r.source.quote, url: r.source.url })) };
  },
});
