// Over-the-counter medicines and supplements: findings that come from the product's own label. Pure.
// Two kinds: (1) a warning line on the package ("ask a doctor before use if you have...") that applies to something
// in the person's profile, quoted word for word; (2) an active ingredient the person already takes.
// The app never says to take or not take anything: it quotes the label and suggests asking a pharmacist.

import { containsTerm, normalise } from "./tagMatch";
import type { Finding, Fit, Verdict } from "./types";

export type WarningSection = "do_not_use" | "ask_doctor" | "ask_doctor_or_pharmacist" | "stop_use" | "other";
export type WarningClause = { section: WarningSection; text: string };

const SECTION_LEAD: Record<WarningSection, string> = {
  do_not_use: "The label says do not use",
  ask_doctor: "The label says to ask a doctor before use",
  ask_doctor_or_pharmacist: "The label says to ask a doctor or pharmacist before use",
  stop_use: "The label says to stop use and ask a doctor",
  other: "The label warns",
};

/** Split printed warning sections into clauses that are exact pieces of the printed text. */
export function warningClauses(sections: Partial<Record<WarningSection, string>>): WarningClause[] {
  const out: WarningClause[] = [];
  for (const section of ["do_not_use", "ask_doctor", "ask_doctor_or_pharmacist", "stop_use", "other"] as WarningSection[]) {
    const text = (sections[section] ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    // Bullets come back from a photo as any of several box and dot characters.
    for (const piece of text.split(/\s*[■□▪▫▯▮●○•◦◆◇◼◻‣⁃·∙]\s*|;\s+|(?<=[.!?])\s+(?=[A-Z])/)) {
      const t = piece.trim();
      if (t.length >= 8) out.push({ section, text: t });
    }
  }
  return out.slice(0, 60);
}

export type ProfileItem = { label: string; kind: "medication" | "condition" | "allergy" };
export type WarningPick = { clause: number; about: string; why: string };

/**
 * Findings from the model's picks. A pick is kept only if its clause number is real and it names a profile item
 * that actually exists. "Do not use" lines block; "ask a doctor" lines become a question for the pharmacist.
 */
export function warningFindings(clauses: WarningClause[], picks: WarningPick[], profile: ProfileItem[], productName: string): Finding[] {
  const known = new Map(profile.map((p) => [normalise(p.label), p]));
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const p of picks) {
    const clause = clauses[p.clause - 1];
    const item = known.get(normalise(p.about));
    if (!clause || !Number.isInteger(p.clause) || !item) continue;
    const key = `${p.clause}:${normalise(p.about)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const lead = SECTION_LEAD[clause.section];
    const blocked = clause.section === "do_not_use";
    out.push({
      outcome: blocked ? "blocked" : "ask",
      because: `${lead} in a case that matches your profile (${item.label}): "${clause.text}"`,
      ...(blocked ? {} : { question: `Ask your pharmacist about ${productName}: the label says "${clause.text}", and you listed ${item.label}.` }),
      source: { title: `${productName} package label`, quote: clause.text },
      about: item.label,
    });
  }
  return out;
}

export type Taking = { medication: string; ingredients: string[] };

/** Active ingredients on the scanned product that the person already takes in another medicine. */
export function duplicateFindings(actives: { name: string }[], taking: Taking[], productName: string): Finding[] {
  const out: Finding[] = [];
  const seen = new Set<string>();
  for (const a of actives) {
    const active = normalise(a.name);
    if (!active) continue;
    for (const t of taking) {
      const hit = t.ingredients.find((ing) => {
        const n = normalise(ing);
        return n.length > 2 && (containsTerm(active, n) || containsTerm(n, active));
      });
      if (!hit || seen.has(`${active}:${t.medication}`)) continue;
      seen.add(`${active}:${t.medication}`);
      out.push({
        outcome: "ask",
        because: `Contains ${a.name}, which is also in your ${t.medication}.`,
        question: `Ask your pharmacist whether ${productName} can be taken alongside ${t.medication}: both contain ${hit}.`,
        source: { title: `${productName} package label`, quote: a.name },
        about: t.medication,
      });
    }
  }
  return out;
}

const WORST: Record<Fit, number> = { not_fit: 3, cant_tell: 2, okay: 1, good: 0 };

/** Add label findings to a verdict. They can only make the fit more cautious, never less. */
export function withLabelFindings(base: Verdict, extra: Finding[]): Verdict {
  if (!extra.length) return base;
  const order = { blocked: 0, ask: 1, confirm: 2, note: 3 } as const;
  const findings = [...extra, ...base.findings].sort((a, b) => order[a.outcome] - order[b.outcome]);
  const fromExtra: Fit = extra.some((f) => f.outcome === "blocked") ? "not_fit" : extra.some((f) => f.outcome === "ask") ? "cant_tell" : base.fit;
  const fit = WORST[fromExtra] > WORST[base.fit] ? fromExtra : base.fit;
  return fit === "not_fit" || fit === "cant_tell" ? { fit, findings } : { ...base, fit, findings };
}
