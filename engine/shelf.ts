// Finding and naming packages on a shelf photo from their own printed words. Pure.
//
// A shelf shows the fronts of packages, and each front carries its own little block of text: brand, product,
// variety. Text recognition gives every line with its position, so the blocks can be found by grouping lines that
// sit on top of one another, and a block can be named by comparing its words with products already known (ones
// that have been scanned by barcode, so their ingredients are real). Nothing here guesses: a block that does not
// clearly match one known product is left unnamed.

import { DEFAULT_THRESHOLDS, evaluate } from "./evaluate";
import type { TextLine } from "./memory";
import { buildChecks, defaultLine, lineItems, type JudgeOpinion, type ReaderOpinion } from "./pipeline";
import { itemFromProduct, type ModelTag, type ProductFacts } from "./product";
import { tagLabel } from "./tags";
import type { Box, Rule } from "./types";

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

// ---- Packages found by looking, not by reading ----
//
// A detector (convex/pipeline.ts detectObjects) can outline every package in the picture, including ones whose
// print is too small or too sparse to group. Its outlines say only WHERE a package is. What it is still comes
// from the words printed inside the outline, matched as before; an outline with no readable name stays unknown.

/** One thing a detector outlined, with how sure it was (0 to 1). */
export type FoundObject = { box: Box; score: number };

const area = (b: Box) => Math.max(0, width(b)) * Math.max(0, height(b));
const shared = (a: Box, b: Box) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

/**
 * The detector's outlines, tidied into one box per package. It is asked for several kinds of thing at once and
 * answers generously, so: the same package outlined twice is kept once (the surer one); an outline that takes in
 * several others is a row or a shelf, not a package, and goes; so does one that covers most of the picture; and
 * an outline sitting inside a package (its lid, its label) goes too. At most `max` are kept, surest first.
 */
export function packageOutlines(objects: FoundObject[], max = 150): Box[] {
  const sane = objects.filter((o) => width(o.box) > 0.012 && height(o.box) > 0.012 && area(o.box) < 0.45).sort((a, b) => b.score - a.score);
  const kept: FoundObject[] = [];
  for (const o of sane) {
    const twin = kept.some((k) => {
      const both = shared(o.box, k.box);
      return both / (area(o.box) + area(k.box) - both) > 0.55;
    });
    if (!twin) kept.push(o);
  }
  const inside = (small: Box, big: Box) => area(small) < area(big) && shared(small, big) / area(small) > 0.8;
  const single = kept.filter((o) => kept.filter((k) => k !== o && inside(k.box, o.box)).length < 2);
  return single.filter((o) => !single.some((k) => k !== o && inside(o.box, k.box))).slice(0, max).map((o) => o.box);
}

/** A package front: where it is, what is printed on it (may be nothing), and how it was found. */
export type PackageFront = TextBlock & { outline: "object" | "text" };

/**
 * One front per package. Every line of text whose middle falls inside an outline belongs to that package (the
 * smallest outline, when they nest), so a package is named from all of its own words and nobody else's. Words
 * outside every outline are grouped into blocks as before, so a package the detector missed is still found by its
 * print. With no outlines at all this is exactly `textBlocks`.
 */
export function packageFronts(lines: TextLine[], outlines: Box[]): PackageFront[] {
  const owned = new Map<number, TextLine[]>();
  const loose: TextLine[] = [];
  for (const l of lines) {
    const x = (l.box.left + l.box.right) / 2, y = (l.box.top + l.box.bottom) / 2;
    let best = -1;
    outlines.forEach((o, i) => {
      if (x >= o.left && x <= o.right && y >= o.top && y <= o.bottom && (best < 0 || area(o) < area(outlines[best]))) best = i;
    });
    if (best < 0) loose.push(l);
    else owned.set(best, [...(owned.get(best) ?? []), l]);
  }
  const found: PackageFront[] = outlines.map((box, i) => {
    const mine = (owned.get(i) ?? []).filter((l) => l.text.replace(/[^A-Za-z]/g, "").length >= 3).sort((a, b) => a.box.top - b.box.top || a.box.left - b.box.left);
    return { box, lines: mine, text: mine.map((l) => l.text).join(" "), outline: "object" };
  });
  const read: PackageFront[] = textBlocks(loose).map((b) => ({ ...b, outline: "text" }));
  return [...found, ...read].sort((a, b) => a.box.top - b.box.top || a.box.left - b.box.left);
}

/**
 * Is the camera looking at a shelf of packages, rather than a menu, a single label, or nothing in particular? The
 * camera looks for packages all the time it is open, so this decides whether to draw anything.
 *
 * A shelf is many small blocks of big words standing side by side: a line on a package front is a word or two, and
 * nearly every package has neighbours level with it on both sides. A menu is the opposite: long lines stacked into
 * one or two tall columns. A product the app already knows settles it on its own, so a single known package held
 * up to the camera is marked too.
 */
export function looksLikeShelf(blocks: TextBlock[], recognised: number): boolean {
  if (recognised >= 1) return true;
  if (blocks.length < 3) return false;
  const counts = blocks.flatMap((b) => b.lines.map((l) => words(l.text).length)).sort((a, b) => a - b);
  const typicalWords = counts[Math.floor(counts.length / 2)] ?? 0;
  if (typicalWords > 2) return false;
  const level = (a: Box, b: Box) => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5 * Math.min(height(a), height(b));
  const beside = (a: Box, b: Box) => b.left >= a.right || b.right <= a.left;
  const inARow = blocks.filter((a) => blocks.filter((b) => b !== a && level(a.box, b.box) && beside(a.box, b.box)).length >= 2).length;
  return inARow / blocks.length >= 0.5;
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
 * The known product a block of text is the front of, or null. A product matches when most of the words of its own
 * name, and at least half of its name and brand together, can be found in the block. When what was read fits two products equally well (two varieties whose
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
      if (brandsSeen.size && brand.length && !brand.some((b) => brandsSeen.has(b))) return { p, hit: 0, share: 0, named: false };
      const want = tokens(`${p.brand ?? ""} ${p.name}`);
      const hit = want.filter((w) => seen.some((s) => agree(s, w)) || (brand.includes(w) && brandsSeen.has(w))).length;
      // The product's own name has to be there, not just its maker's range: every tin in a brand's line shares the
      // brand's words, and it is the name that says which one this is.
      const own = tokens(p.name).filter((w) => !brand.includes(w));
      const ownHit = own.filter((w) => seen.some((s) => agree(s, w))).length;
      return { p, hit, share: want.length ? hit / want.length : 0, named: own.length > 0 && ownHit / own.length >= 0.6 };
    })
    .sort((x, y) => y.hit - x.hit || y.share - x.share);
  // At least two of its words, and at least half of them: the brand is often the word that cannot be read.
  const best = scored.find((x) => x.named && x.hit >= 2 && x.share >= 0.5);
  if (!best) return null;
  // Everything that was read fits another product just as well: the word that would settle it was not read.
  if (scored.some((x) => x.p.key !== best.p.key && x.hit >= best.hit)) return null;
  return best.p;
}

// ---- What to show for a package that has been named ----

/**
 * How a package is marked on the shelf view.
 * - "good": recognised, read carefully (code and the models), and nothing is against the person's rules. It is the
 *   same verdict a barcode scan of the product gives, and carries the same caveat: the product is known from its
 *   database record, which can say an allergen is there but cannot prove it is not. So a good package with a Never
 *   rule in play still comes with a "confirm" reason to check the package, exactly as a menu dish does.
 * - "unflagged": recognised, nothing against it yet, but the careful reading has not come back. Never shown as good.
 * - "unknown": a package whose words did not match a product the app knows.
 */
export type ShelfState = "good" | "not_fit" | "cant_tell" | "okay" | "unflagged" | "unknown";

export type ShelfBox = {
  box: Box;
  state: ShelfState;
  /** The product's barcode and name, when the package was recognised. */
  key?: string;
  name?: string;
  /** A few words on why, for a package that is flagged. */
  reason?: string;
  /** True while only code has looked at the ingredients; the models' careful reading is still on its way. */
  checking?: boolean;
  /** True when `box` already surrounds the whole package (the judge drew it), not just the words on it. */
  whole?: boolean;
};

/**
 * Apply the person's rules to a recognised product. `opinions` are the models' reading of its ingredient list when
 * that is already known (the product has been scanned before); without them only code's own reading of the words
 * is used, and the result is marked as still being checked.
 */
export function shelfVerdict(facts: ProductFacts, rules: Rule[], opinions: { modelTags: ModelTag[]; opinions: ReaderOpinion[] } | null): Pick<ShelfBox, "state" | "reason" | "checking"> {
  const item = itemFromProduct(facts, opinions?.modelTags ?? []);
  const verdict = evaluate(item, rules, buildChecks([item], rules, opinions?.opinions ?? []));
  // Good only once the careful reading is in: code's own look at the words is enough to flag, not to clear.
  const state: ShelfState = verdict.fit === "good" && !opinions ? "unflagged" : verdict.fit;
  const flagged = state === "not_fit" || state === "cant_tell";
  // A good product that a Never rule could not fully clear says what to check on the package.
  const toConfirm = state === "good" && verdict.findings.some((f) => f.outcome === "confirm");
  return { state, ...(flagged || toConfirm ? { reason: defaultLine(verdict, rules) } : {}), ...(opinions ? {} : { checking: true }) };
}

/** A stable name for a block of words, so the same unrecognised package is not looked up again and again. */
export function blockSignature(text: string): string {
  return tokens(text).sort().join(" ");
}

/** The words worth searching a product database for: the longest few, which are the least likely to be fragments. */
export function searchTerms(text: string, max = 4): string[] {
  return tokens(text).filter((w) => w.length >= 4 && !/\d/.test(w)).sort((a, b) => b.length - a.length).slice(0, max);
}

// ---- A first colour for a package that has not been identified yet ----

/** One item per package front, made of the words read off it, so the judge can be asked about each. */
export function frontItems(fronts: string[]) {
  return lineItems(fronts.map((text) => ({ text, box: { top: 0, left: 0, bottom: 1, right: 1 } })));
}

/**
 * Which unidentified fronts to ask about on one still, when a detector has outlined a whole shelf and there are
 * more than can be asked about in time. Packages with the same words on them (a row of one product) are asked
 * about once and share the answer; the biggest packages, which are the nearest, go first. `fronts` runs parallel
 * to the packages in the picture; one with no text (nothing read off it, or already recognised) is skipped.
 * Returns each wording to ask about with the indexes of the packages that carry it.
 */
export function frontsToAsk(fronts: { text: string; box: Box }[], max: number): { text: string; at: number[] }[] {
  const groups = new Map<string, { text: string; at: number[]; size: number }>();
  fronts.forEach((f, i) => {
    const text = f.text.trim();
    if (!text) return;
    const key = blockSignature(text) || text.toLowerCase();
    const g = groups.get(key) ?? { text, at: [], size: 0 };
    g.at.push(i);
    g.size = Math.max(g.size, area(f.box));
    groups.set(key, g);
  });
  return [...groups.values()].sort((a, b) => b.size - a.size).slice(0, max).map(({ text, at }) => ({ text, at }));
}

/**
 * What can be said about a package from the words on its front alone, before anyone knows which product it is.
 * Code's own reading of the words ("almond" printed on the front) and the judge's opinion of what such a product
 * commonly contains ("Snickers": peanuts) can raise a flag; nothing here can call a package fine, so a front with
 * nothing against it gets no answer at all. Whatever this returns is provisional and is shown as still being
 * checked: the product's real ingredients replace it once it has been identified.
 */
export function frontHints(fronts: string[], rules: Rule[], judge: JudgeOpinion[] = []): ({ state: "not_fit" | "cant_tell"; reason: string } | null)[] {
  const items = frontItems(fronts);
  const levelOf = new Map(rules.map((r) => [r.id, r.level]));
  // As on a menu's raw lines: only a judge that thinks it likely counts. Unsure is the normal state for a few words.
  const likely = judge.filter((j) => {
    const level = levelOf.get(j.ruleId);
    return (level === "never" || level === "avoid") && j.p >= DEFAULT_THRESHOLDS[level].high;
  });
  const checks = buildChecks(items, rules, [], likely);
  return items.map((item) => {
    const verdict = evaluate(item, rules, checks);
    if (verdict.fit !== "not_fit" && verdict.fit !== "cant_tell") return null;
    // Worded as the guess it is: nobody has seen this product's ingredients yet.
    const finding = verdict.findings.find((f) => f.outcome === (verdict.fit === "not_fit" ? "blocked" : "ask"));
    const rule = rules.find((r) => r.id === finding?.ruleId);
    const what = rule ? tagLabel(rule.tag) : "something in your rules";
    return { state: verdict.fit, reason: verdict.fit === "not_fit" ? `Likely contains ${what}.` : `May contain ${what}.` };
  });
}
