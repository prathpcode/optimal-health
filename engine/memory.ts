// What a restaurant has told people before, and where on the photo each dish is. Pure.

import { normalise } from "./tagMatch";
import { tagSatisfies } from "./tags";
import type { Box, HardCheck, Item, Rule } from "./types";

/** How long a person's own "no" stands before the question is asked again. */
export const NO_ANSWER_DAYS = 30;

/** A restaurant is its printed name plus where the phone was, rounded to about 100 m. Both are needed. */
export function restaurantId(name: string | undefined, location: { lat: number; lng: number } | undefined): string | null {
  const n = normalise(name ?? "");
  if (!n || !location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return null;
  return `${n.replace(/ /g, "-")}@${location.lat.toFixed(3)},${location.lng.toFixed(3)}`;
}

/** A dish is its printed name and description, so a reworded dish is a new dish and gets asked about again. */
export function dishKey(item: Pick<Item, "name" | "description">): string {
  return normalise(`${item.name} ${item.description ?? ""}`);
}

export type RememberedAnswer = { dishKey: string; tag: string; value: "yes" | "no"; deviceId: string; at: string };

/**
 * Attach remembered answers to checks.
 * - A "yes" from anyone counts, for everyone, with no expiry: it is the restaurant saying the dish contains it.
 * - A "no" counts only for the person who asked, and only for NO_ANSWER_DAYS.
 * - A "yes" beats a "no"; among several of the same kind the most recent is used.
 */
export function applyRemembered(checks: HardCheck[], items: Item[], rules: Rule[], remembered: RememberedAnswer[], deviceId: string, now: Date): HardCheck[] {
  if (!remembered.length) return checks;
  const itemById = new Map(items.map((i) => [i.id, i]));
  const ruleById = new Map(rules.map((r) => [r.id, r]));
  const cutoff = now.getTime() - NO_ANSWER_DAYS * 86400_000;
  return checks.map((c) => {
    if (c.answer) return c;
    const item = itemById.get(c.itemId);
    const rule = ruleById.get(c.ruleId);
    if (!item || !rule) return c;
    const key = dishKey(item);
    const mine = remembered.filter((a) => a.dishKey === key).sort((a, b) => b.at.localeCompare(a.at));
    // "Yes, it has pork" also answers a question about meat. "No pork" says nothing about other meat, but
    // "no meat" does answer a question about pork. So a yes travels up to what the tag implies, a no travels down.
    const yes = mine.find((a) => a.value === "yes" && tagSatisfies(a.tag, rule.tag));
    if (yes) return { ...c, answer: { value: "yes" as const, by: yes.deviceId === deviceId ? ("this_user" as const) : ("another_user" as const), at: yes.at } };
    const no = mine.find((a) => a.value === "no" && tagSatisfies(rule.tag, a.tag) && a.deviceId === deviceId && Date.parse(a.at) >= cutoff);
    if (no) return { ...c, answer: { value: "no" as const, by: "this_user" as const, at: no.at } };
    return c;
  });
}

// ---- Where each dish is on the photo ----

export type TextLine = { text: string; box: Box };

/**
 * Find each dish on the photo from the text lines the phone recognised. A line belongs to a dish when it holds the
 * dish's name, or sits directly under the name and its words appear in the dish's description. No model involved,
 * so a box can only ever be where that dish's own words are.
 */
export function positionsFor(dishes: Pick<Item, "name" | "description">[], lines: TextLine[]): (Box[] | undefined)[] {
  const norm = lines.map((l) => normalise(l.text));
  const used = new Set<number>();
  return dishes.map((d) => {
    const name = normalise(d.name);
    if (!name) return undefined;
    // The name line. A line that IS the name, or begins with it, is taken before one that merely mentions it: a
    // heading such as "beverages (excludes house-made sodas)" is not the dish "Sodas" printed two lines below.
    let at = norm.findIndex((t, i) => !used.has(i) && t === name);
    if (at < 0) at = norm.findIndex((t, i) => !used.has(i) && t.startsWith(`${name} `));
    // Otherwise an unused line that contains the name, or is contained by it (names wrap across two lines).
    if (at < 0) at = norm.findIndex((t, i) => !used.has(i) && t.length > 1 && (t.includes(name) || (name.includes(t) && t.split(" ").length >= 2)));
    if (at < 0) at = norm.findIndex((t, i) => !used.has(i) && t.length > 1 && name.split(" ").filter((w) => w.length > 2 && t.split(" ").includes(w)).length >= Math.max(1, Math.ceil(name.split(" ").filter((w) => w.length > 2).length * 0.7)));
    if (at < 0) return undefined;
    const boxes = [lines[at].box];
    used.add(at);
    const desc = normalise(d.description ?? "");
    for (let i = at + 1; i < lines.length && i <= at + 4; i++) {
      if (used.has(i)) break;
      const words = norm[i].split(" ").filter((w) => w.length > 2);
      const hits = words.filter((w) => desc.includes(w)).length;
      const partOfName = name.includes(norm[i]) && norm[i].length > 2;
      if (!(partOfName || (desc && words.length && hits / words.length >= 0.6))) break;
      boxes.push(lines[i].box);
      used.add(i);
    }
    return boxes;
  });
}
