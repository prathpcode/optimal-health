"use node";

// The shelf view: point the camera along a shelf and see which packages are worth picking up.
//
// One still in, boxes out, about once a second. Each still is handled on its own (no tracking): a detector
// outlines every package it can see while the text on the still is recognised; each package gets the words inside
// its outline (engine/shelf.ts), and those words are compared with the products the app already knows by barcode.
// With no detector configured, packages are found from blocks of print alone. A package it recognises is checked against the person's rules; one it
// does not is outlined and, in the background, identified so that a later frame knows it: the photo reader reads
// its front properly, the product database is searched for it, and the judge picks the record that is the same
// product (same variety included).
//
// What each shelf verdict means, and when a package may be shown as a good fit, is fixed in engine/shelf.ts.

import Anthropic from "@anthropic-ai/sdk";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import { hardRules } from "../engine/pipeline";
import { hasSubstance, type ProductFacts } from "../engine/product";
import { blockSignature, matchProduct, packageFronts, packageOutlines, searchTerms, shelfVerdict, type KnownProduct, type ShelfBox } from "../engine/shelf";
import { judgeSameProduct } from "./judge";
import { answerCache, detectObjects, lookUpProduct, Memo, productOpinions, readPackages, recogniseLinesIn, rememberedProductOpinions, type PackageReading } from "./pipeline";

/** A still is small on purpose (about 1300 px a side); anything much bigger is not from the app. */
const MAX_IMAGE_CHARS = 2_500_000;
const MINUTE = 60_000;

export const look = action({
  args: { deviceId: v.string(), image: v.string() },
  handler: async (ctx, { deviceId, image }): Promise<{ boxes: ShelfBox[]; ms: number; reading: boolean }> => {
    const started = Date.now();
    if (image.length > MAX_IMAGE_CHARS) throw new Error("That picture is too large");
    const timed = async <T>(what: string, p: Promise<T>): Promise<T> => {
      const t = Date.now();
      const out = await p;
      steps[what] = Date.now() - t;
      return out;
    };
    const steps: Record<string, number> = {};
    const [lines, objects, context] = await Promise.all([timed("text", recogniseLinesIn(image)), timed("objects", detectObjects(image)), timed("context", ctx.runQuery(internal.shelfData.context, { deviceId }))]);
    // Neither text recognition nor detection is configured, or both failed: say so rather than show an empty shelf
    // as if nothing were there.
    if (!lines && !objects) return { boxes: [], ms: Date.now() - started, reading: false };
    // Where the packages are (the detector's outlines, or with none, blocks of print), each with the words on it.
    const blocks = packageFronts(lines ?? [], packageOutlines(objects ?? []));
    steps.found = objects?.length ?? -1;
    const facts = new Map<string, ProductFacts>();
    for (const p of context.products) {
      try {
        facts.set(p.barcode, JSON.parse(p.facts) as ProductFacts);
      } catch {
        // A record that does not parse is as good as not known.
      }
    }
    // Each product under the database's name for it, and under what its front has been read to say.
    const known: KnownProduct[] = [
      ...[...facts].map(([key, f]) => ({ key, name: f.name, ...(f.brand ? { brand: f.brand } : {}) })),
      ...context.fronts.filter((f) => facts.has(f.barcode)).map((f) => ({ key: f.barcode, name: f.name, ...(f.brand ? { brand: f.brand } : {}) })),
    ];
    const named = blocks.map((b) => ({ block: b, product: b.text ? matchProduct(b.text, known) : null }));

    // The models' careful reading of each recognised product, where it is already remembered.
    const watch = [...new Set(hardRules(context.rules).map((r) => r.tag))];
    const seen = [...new Set(named.flatMap((n) => (n.product ? [n.product.key] : [])))];
    const remembered = await timed("remembered", rememberedProductOpinions(answerCache(ctx), seen.map((k) => facts.get(k)!), watch));
    const opinions = new Map(seen.map((k, i) => [k, remembered[i]]));

    const boxes: ShelfBox[] = named.map(({ block, product }) => {
      if (!product) return { box: block.box, outline: block.outline, state: "unknown" };
      const f = facts.get(product.key)!;
      return { box: block.box, outline: block.outline, key: product.key, name: [f.brand, f.name].filter(Boolean).join(" "), ...shelfVerdict(f, context.rules, opinions.get(product.key) ?? null) };
    });

    // In the background: read the ingredients of recognised products that have not been read for these rules yet,
    // and look up one package that was not recognised. Each is claimed first, so a shelf held in view for ten
    // seconds starts each job once, not ten times.
    const beforeJobs = Date.now();
    if (watch.length) {
      for (const key of seen.filter((k) => !opinions.get(k)).slice(0, 4)) {
        if (await ctx.runMutation(internal.shelfData.claim, { key: `read:${key}:${watch.join(",")}`, ttlMs: MINUTE })) {
          await ctx.scheduler.runAfter(0, internal.shelf.read, { barcode: key, watch });
        }
      }
    }
    // Packages that were read but not recognised: have them identified, a few at a time. The still is kept just
    // long enough for the photo reader to look at it.
    const strangers = [...new Map(named.filter((n) => !n.product && searchTerms(n.block.text).length >= 2).map((n) => [blockSignature(n.block.text), n.block.text])).entries()].slice(0, 6);
    if (strangers.length && process.env.ANTHROPIC_API_KEY && (await ctx.runMutation(internal.shelfData.claim, { key: "identify:any", ttlMs: 30_000 }))) {
      const fronts: string[] = [];
      for (const [signature, text] of strangers) {
        if (await ctx.runMutation(internal.shelfData.claim, { key: `identify:${signature}`, ttlMs: 10 * MINUTE })) fronts.push(text);
      }
      steps.strangers = strangers.length;
      steps.toIdentify = fronts.length;
      if (fronts.length) {
        const imageId = await ctx.storage.store(new Blob([Buffer.from(image, "base64")], { type: "image/jpeg" }));
        await ctx.scheduler.runAfter(0, internal.shelf.identify, { imageId, fronts });
      }
    }
    steps.jobs = Date.now() - beforeJobs;
    console.log("shelf look", JSON.stringify({ ms: Date.now() - started, ...steps, blocks: blocks.length, known: known.length }));
    return { boxes, ms: Date.now() - started, reading: true };
  },
});

/** Have the models read one product's ingredient list for these things to watch for, and remember the answers. */
export const read = internalAction({
  args: { barcode: v.string(), watch: v.array(v.string()) },
  handler: async (ctx, { barcode, watch }): Promise<null> => {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    const facts = await lookUpProduct(ctx, barcode).catch(() => null);
    if (!facts) return null;
    await productOpinions(new Memo(new Anthropic(), answerCache(ctx)), facts, watch).catch((e) => console.error("shelf read failed", e));
    return null;
  },
});

type Candidate = KnownProduct;

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * The database record for a package whose front has been read, or null. The database's text search wants every
 * word to be in the record, and a record rarely repeats the front word for word (the range name is often left out,
 * "Sweet Corn" is "Sweetcorn"), so the front is searched whole and then in parts, until one search turns up a
 * record that `sameProduct` accepts. Searches are spaced out: the database asks for only a few a minute.
 */
async function findProduct(reading: PackageReading): Promise<{ match: Candidate | null; searched: number; offered: number }> {
  let offered = 0;
  const tried = new Set<string>();
  const parts = [[reading.brand, reading.name, reading.variety], [reading.brand, reading.variety], [reading.name, reading.variety], [reading.brand, reading.name]];
  for (const part of parts) {
    const terms = searchTerms(part.filter(Boolean).join(" "), 5);
    const query = terms.join(" ");
    if (terms.length < 2 || tried.has(query)) continue;
    if (tried.size) await pause(2000);
    tried.add(query);
    const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
    for (const [k, val] of Object.entries({ search_terms: query, search_simple: "1", action: "process", json: "1", page_size: "8", fields: "code,product_name,brands" })) url.searchParams.set(k, val);
    try {
      const res = await fetch(url, { headers: { "User-Agent": "second-look/0.1" }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const found = ((await res.json()) as { products?: { code?: string; product_name?: string; brands?: string }[] }).products ?? [];
      const candidates = found.filter((p) => p.code && p.product_name?.trim()).map((p) => ({ key: p.code!, name: p.product_name!.trim(), ...(p.brands?.trim() ? { brand: p.brands.split(",")[0].trim() } : {}) }));
      offered += candidates.length;
      const match = candidates.length ? await sameProduct(reading, candidates) : null;
      if (match) return { match, searched: tried.size, offered };
    } catch (e) {
      console.error("shelf lookup failed", e);
    }
  }
  return { match: null, searched: tried.size, offered };
}

/**
 * Which candidate, if any, is the product whose front was read. Two independent checks: code compares the words
 * (engine/shelf.ts matchProduct, which refuses when two candidates fit equally), and the judge is asked of each
 * candidate whether it is the same product and variety. They must not disagree: the judge can settle what the
 * words alone leave open, and can veto a match it thinks is another variety, but a record is never accepted on the
 * judge's say-so unless its words fit too.
 */
async function sameProduct(reading: PackageReading, candidates: Candidate[]): Promise<Candidate | null> {
  const front = [reading.brand, reading.name, reading.variety].filter(Boolean).join(" ");
  const byWords = matchProduct(front, candidates);
  const ps = await judgeSameProduct(reading, candidates);
  console.log("shelf candidates", JSON.stringify(candidates.map((c, i) => `${c.brand ?? ""} ${c.name}${ps ? ` p=${ps[i].toFixed(2)}` : ""}${c === byWords ? " <words>" : ""}`)));
  if (!ps) return byWords;
  const top = ps.indexOf(Math.max(...ps));
  const judged = ps[top] >= 0.8 && ps.every((p, i) => i === top || p < 0.5) ? candidates[top] : null;
  if (byWords) return ps[candidates.indexOf(byWords)] >= 0.5 ? byWords : null;
  return judged && matchProduct(front, [judged]) ? judged : null;
}

/**
 * Identify packages the shelf view read but did not recognise. The photo reader looks at the still and reads each
 * front properly; each reading is searched for in the product database; a record accepted by `sameProduct` is
 * fetched in full and becomes a known product, remembered under the words on its front, so the next frame
 * recognises it. A package that cannot be read, or is not in the database, stays unrecognised: nothing is ever
 * inferred about a product's ingredients from how it looks. Returns how many were identified.
 */
export const identify = internalAction({
  args: { imageId: v.id("_storage"), fronts: v.array(v.string()) },
  handler: async (ctx, { imageId, fronts }): Promise<number> => {
    let identified = 0;
    try {
      const url = await ctx.storage.getUrl(imageId);
      if (!url || !process.env.ANTHROPIC_API_KEY) return 0;
      const readings = await readPackages(new Anthropic(), url, fronts);
      // Several of the rough readings are usually the same product, standing in a row: look each product up once.
      const distinct = [...new Map(readings.map((r) => [blockSignature([r.brand, r.name, r.variety].join(" ")), r])).values()];
      for (const reading of distinct.slice(0, 3)) {
        const front = [reading.brand, reading.name, reading.variety].filter(Boolean).join(" ");
        const { match, searched, offered } = await findProduct(reading);
        console.log("shelf identify", JSON.stringify({ front, searches: searched, candidates: offered, match: match ? `${match.brand ?? ""} ${match.name}`.trim() : null }));
        if (match) {
          // Fetching it by barcode stores it with the known products; only one with ingredients or allergens to go on is kept.
          const facts = await lookUpProduct(ctx, match.key).catch(() => null);
          if (facts && hasSubstance(facts)) {
            await ctx.runMutation(internal.shelfData.nameFront, { barcode: match.key, name: [reading.name, reading.variety].filter(Boolean).join(" "), ...(reading.brand ? { brand: reading.brand } : {}) });
            identified++;
          }
        }
        await pause(2000);
      }
    } catch (e) {
      console.error("shelf identify failed", e);
    } finally {
      await ctx.storage.delete(imageId).catch(() => {});
    }
    return identified;
  },
});
