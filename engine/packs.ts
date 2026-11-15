// Rule packs: ready-made sets of rules a person can buy (convex/packs.ts sells them through Whop). Pure.
//
// A pack is written like a condition in data/rules/conditions.json: each rule quotes its source page, the quote is
// re-checked by `npm run verify:sources`, and the rule's status is "sourced" (not reviewed by a clinician).

import packsJson from "../data/packs.json";
import { isKnownTag, tagLabel } from "./tags";
import type { Rule, RuleLevel, TagId } from "./types";

type PackEntry = {
  label: string;
  blurb: string;
  priceCents: number;
  source: { title: string; url: string };
  rules: { level: RuleLevel; tag: TagId; reason: string; quote: string }[];
};
const PACKS = packsJson.packs as Record<string, PackEntry>;

export type PackInfo = {
  id: string;
  label: string;
  blurb: string;
  priceCents: number;
  source: { title: string; url: string };
  /** What buying it adds, for showing before the purchase. */
  rules: { level: RuleLevel; tag: TagId; label: string }[];
};

function info(id: string, p: PackEntry): PackInfo {
  return {
    id,
    label: p.label,
    blurb: p.blurb,
    priceCents: p.priceCents,
    source: p.source,
    rules: p.rules.filter((r) => isKnownTag(r.tag)).map((r) => ({ level: r.level, tag: r.tag, label: tagLabel(r.tag) })),
  };
}

/** Every pack on sale, in the order they are listed. */
export function packList(): PackInfo[] {
  return Object.entries(PACKS).map(([id, p]) => info(id, p));
}

export function packInfo(id: string): PackInfo | null {
  const p = PACKS[id];
  return p ? info(id, p) : null;
}

/** The rules the given packs add. Unknown pack ids add nothing. */
export function packRules(packIds: string[]): Rule[] {
  const rules: Rule[] = [];
  for (const id of new Set(packIds)) {
    const p = PACKS[id];
    if (!p) continue;
    for (const r of p.rules) {
      if (!isKnownTag(r.tag)) continue;
      rules.push({
        id: `pack:${id}:${r.tag}`,
        level: r.level,
        tag: r.tag,
        reason: r.reason,
        source: { ...p.source, quote: r.quote },
        from: { type: "condition", label: `${p.label} pack` },
        status: "sourced",
        enabled: true,
      });
    }
  }
  return rules;
}
