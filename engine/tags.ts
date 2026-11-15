import tagsJson from "../data/tags.json";
import type { Nutrients, TagId } from "./types";

export type TagInfo = {
  id: TagId;
  label: string;
  group: "allergen" | "ingredient" | "preparation" | "diet" | "nutrient" | "supplement";
  /** Other tags this one always carries (pork is meat; wheat has gluten). */
  implies?: TagId[];
  /** For nutrient tags with a number on a label: the matching Nutrients field. */
  nutrient?: Exclude<keyof Nutrients, "per">;
};

export const TAGS: TagInfo[] = tagsJson.tags as TagInfo[];
const byId = new Map(TAGS.map((t) => [t.id, t]));

export function tagInfo(id: TagId): TagInfo | undefined {
  return byId.get(id);
}

export function isKnownTag(id: TagId): boolean {
  return byId.has(id);
}

export function tagLabel(id: TagId): string {
  return byId.get(id)?.label ?? id.replace(/_/g, " ");
}

/** A tag plus everything it implies, e.g. pork -> [pork, meat]. */
export function withImplied(id: TagId): TagId[] {
  const out = new Set<TagId>();
  const walk = (t: TagId) => {
    if (out.has(t)) return;
    out.add(t);
    for (const i of byId.get(t)?.implies ?? []) walk(i);
  };
  walk(id);
  return [...out];
}

/** True when `have` is `want` or implies it. A rule on "meat" is matched by an item tagged "pork". */
export function tagSatisfies(have: TagId, want: TagId): boolean {
  return withImplied(have).includes(want);
}
