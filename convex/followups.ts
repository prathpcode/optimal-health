"use node";

import Anthropic from "@anthropic-ai/sdk";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { tagLabel } from "../engine/tags";
import type { Item, Rule, Verdict } from "../engine/types";

const SYSTEM = `You answer follow-up questions inside a food-fit app. The person has just scanned a menu or a product, and code
has already decided each item's verdict from their own rules.

You are given their rules, the scanned items and the verdicts. Answer from that material only.
- You may explain a verdict, compare items, and reason about "what if" changes to a dish using the item's listed and
  inferred ingredients. Say plainly when something was inferred rather than printed.
- You may not overturn or soften a verdict. If a change would not remove the concern (for example leaving nuts off does
  not address an allergy, because of shared equipment and hidden ingredients), say so.
- Never say anything is "safe". Never tell anyone to take, stop or change a medication. Never diagnose or give medical
  advice. For questions about their health or medicines, say that is one for their pharmacist or doctor.
- If the material does not contain the answer, say you cannot tell from the scan and suggest what to ask the staff or
  check on the label.
- Refer to verdicts in the app's words: Good fit, Okay, Not a fit, Can't tell.
- Two to four plain sentences. No lists, no headings, no emoji.`;

const FIT_WORDS = { good: "Good fit", okay: "Okay, with notes", not_fit: "Not a fit", cant_tell: "Can't tell" } as const;

function describe(items: Item[], verdicts: Record<string, Verdict>, rules: Rule[], focus?: string): string {
  const ruleText = rules
    .filter((r) => r.enabled)
    .map((r) => `- ${r.level.toUpperCase()} ${tagLabel(r.tag)} (from: ${r.from.label})${r.source.quote ? ` — source says: "${r.source.quote}"` : ""}`)
    .join("\n");
  const itemText = items
    .map((it) => {
      const vd = verdicts[it.id];
      const stated = it.ingredients.filter((i) => i.origin !== "inferred").map((i) => i.name);
      const inferred = it.ingredients.filter((i) => i.origin === "inferred").map((i) => i.name);
      return [
        `- ${it.id === focus ? "(THE ITEM BEING ASKED ABOUT) " : ""}${it.name}${it.description ? ` — ${it.description}` : ""}`,
        stated.length ? `  listed: ${stated.join(", ")}` : "",
        inferred.length ? `  inferred, not printed: ${inferred.join(", ")}` : "",
        it.nutrients ? `  nutrition ${it.nutrients.per === "serving" ? "per serving" : "per 100 g"}: ${JSON.stringify(it.nutrients)}` : "",
        vd ? `  verdict: ${FIT_WORDS[vd.fit]}` : "",
        ...(vd?.findings ?? []).map((f) => `    - ${f.outcome}${f.unsourced ? " (assistant note, unsourced)" : ""}: ${f.because}`),
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
  return `Their rules:\n${ruleText || "(none set up)"}\n\nScanned items:\n${itemText}`;
}

/** Answer a follow-up question about a finished scan, optionally about one item in it. */
export const ask = action({
  args: { scanId: v.id("scans"), itemId: v.optional(v.string()), text: v.string() },
  handler: async (ctx, { scanId, itemId, text }): Promise<string> => {
    const question = text.trim().slice(0, 600);
    if (!question) return "";
    const scan: { items: Item[]; verdicts: Record<string, Verdict>; rules: Rule[] } | null = await ctx.runQuery(internal.scans.forFollowup, { scanId });
    if (!scan || !scan.items.length) return "There is no finished scan to ask about yet.";
    if (!process.env.ANTHROPIC_API_KEY) return "Follow-up questions are not available right now.";
    const client = new Anthropic();
    const response = await client.messages.create({
      model: process.env.EXPLAIN_MODEL || process.env.READER_MODEL || "claude-opus-5-5",
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: "user", content: `${describe(scan.items, scan.verdicts, scan.rules, itemId)}\n\nTheir question: ${question}` }],
      output_config: { effort: "low" },
    });
    if (response.stop_reason === "refusal") return "I can't help with that one. For questions about your health or medicines, your pharmacist or doctor is the right person.";
    const answer = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("").trim();
    return answer || "I could not work that out from this scan.";
  },
});
