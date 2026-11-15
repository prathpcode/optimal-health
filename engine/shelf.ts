// Finding and naming packages on a shelf photo from their own printed words. Pure.
//
// A shelf shows the fronts of packages, and each front carries its own little block of text: brand, product,
// variety. Text recognition gives every line with its position, so the blocks can be found by grouping lines that
// sit on top of one another, and a block can be named by comparing its words with products already known (ones
// that have been scanned by barcode, so their ingredients are real). Nothing here guesses: a block that does not
// clearly match one known product is left unnamed.

import type { TextLine } from "./memory";
import type { Box } from "./types";

export type TextBlock = { text: string; box: Box; lines: TextLine[] };

const width = (b: Box) => b.right - b.left;
const height = (b: Box) => b.bottom - b.top;
const words = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);

/** Recognition sometimes runs two neighbouring packages' words into one line ("Country Country"). Such a line would tie the two packages together. */
const bridges = (text: string) => {
  const w = words(text);
  return w.some((x, i) => i > 0 && x === w[i - 1] && x.length > 2);
};

/**
 * Group lines into blocks, one per package front. Two lines belong together when one sits right under the other:
 * they overlap sideways, the gap between them is about a line's height or less, and they are of similar size (a
 * price tag's small print under a tin is not part of the tin). Blocks of a single line are dropped: a lone word is
 * usually a shelf label or a fragment.
 */
export function textBlocks(lines: TextLine[]): TextBlock[] {
  const use = lines.filter((l) => l.text.replace(/[^A-Za-z]/g, "").length >= 3 && !bridges(l.text) && width(l.box) > 0 && height(l.box) > 0);
  const parent = use.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < use.length; i++) {
    for (let j = i + 1; j < use.length; j++) {
      const a = use[i].box, b = use[j].box;
      const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      if (overlap / Math.min(width(a), width(b)) < 0.3) continue;
      const tall = Math.max(height(a), height(b)), short = Math.min(height(a), height(b));
      if (tall / short > 3) continue;
      const gap = Math.max(b.top - a.bottom, a.top - b.bottom);
      if (gap <= tall) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, TextLine[]>();
  use.forEach((l, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), l]));
  return [...groups.values()]
    .filter((g) => g.length >= 2)
    .map((g) => {
      const sorted = [...g].sort((a, b) => a.box.top - b.box.top || a.box.left - b.box.left);
      return {
        text: sorted.map((l) => l.text).join(" "),
        lines: sorted,
        box: { top: Math.min(...g.map((l) => l.box.top)), left: Math.min(...g.map((l) => l.box.left)), bottom: Math.max(...g.map((l) => l.box.bottom)), right: Math.max(...g.map((l) => l.box.right)) },
      };
    })
    .sort((a, b) => a.box.top - b.box.top || a.box.left - b.box.left);
}

export type KnownProduct = { key: string; name: string; brand?: string };

/** Words that say nothing about which product this is. */
const FILLER = new Set(["and", "with", "the", "for", "new", "net", "original", "brand", "inc", "co"]);
const tokens = (s: string) => [...new Set(words(s).filter((w) => w.length >= 3 && !FILLER.has(w)))];

/**
 * Do two words agree, allowing for how text is misread on a curved or distant package: cut short ("minestro"),
 * or one letter wrong ("classe" for "classic" is too far; "chicke" for "chicken" is not).
 */
function agree(seen: string, real: string): boolean {
  if (seen === real) return true;
  const short = seen.length <= real.length ? seen : real, long = seen.length <= real.length ? real : seen;
  if (short.length >= 4 && long.startsWith(short)) return true;
  // The same word with its ending misread ("minestra" for "minestrone"): nearly all of the shorter one matches.
  let same = 0;
  while (same < short.length && short[same] === long[same]) same++;
  if (same >= 5 && same / short.length >= 0.8) return true;
  if (short.length >= 5 && long.length - short.length <= 1) {
    // One letter different, missing or added.
    let i = 0;
    while (i < short.length && short[i] === long[i]) i++;
    return short.slice(i + (short.length === long.length ? 1 : 0)) === long.slice(i + 1);
  }
  return false;
}

/** Looser than `agree`, for brand names only: the first four letters match and most of the shorter word does. */
function sameStart(seen: string, real: string): boolean {
  const n = Math.min(seen.length, real.length);
  let same = 0;
  while (same < n && seen[same] === real[same]) same++;
  return same >= 4 && same / n >= 0.6;
}

/**
 * The known product a block of text is the front of, or null. A product matches when at least half of the words in
 * its name and brand can be found in the block. When what was read fits two products equally well (two varieties whose
 * distinguishing word could not be read), neither is chosen: showing the wrong variety's verdict is worse than
 * showing none.
 */
export function matchProduct(block: string, products: KnownProduct[]): KnownProduct | null {
  const seen = tokens(block);
  if (seen.length < 2) return null;
  // Which known brands the block appears to carry. A brand name is the biggest word on a package and still gets
  // mangled ("Campll"), so it is recognised more loosely than other words.
  const brandsSeen = new Set(products.flatMap((p) => tokens(p.brand ?? "")).filter((b) => seen.some((s) => agree(s, b) || sameStart(s, b))));
  const scored = products
    .map((p) => {
      const brand = tokens(p.brand ?? "");
      // A package that shows some other known brand is not this product, however many other words agree:
      // "Country Chicken" from one maker is not "Country ... Chicken" from another.
      if (brandsSeen.size && brand.length && !brand.some((b) => brandsSeen.has(b))) return { p, hit: 0, share: 0 };
      const want = tokens(`${p.brand ?? ""} ${p.name}`);
      const hit = want.filter((w) => seen.some((s) => agree(s, w)) || (brand.includes(w) && brandsSeen.has(w))).length;
      return { p, hit, share: want.length ? hit / want.length : 0 };
    })
    .sort((x, y) => y.hit - x.hit || y.share - x.share);
  // At least two of its words, and at least half of them: the brand is often the word that cannot be read.
  const best = scored.find((x) => x.hit >= 2 && x.share >= 0.5);
  if (!best || best !== scored[0]) return null;
  // Everything that was read fits another product just as well: the word that would settle it was not read.
  if (scored.some((x) => x.p.key !== best.p.key && x.hit >= best.hit)) return null;
  return best.p;
}
