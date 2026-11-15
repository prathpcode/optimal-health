"use node";

// The shelf view: point the camera along a shelf and see which packages are worth picking up.
//
// One still in, boxes out, about once a second. Each still is handled on its own (no tracking): the text on it is
// recognised, grouped into one block per package front (engine/shelf.ts), and each block is compared with the
// products the app already knows by barcode. A package it recognises is checked against the person's rules; one it
// does not is outlined and, in the background, looked up so that a later frame may know it.
//
// What a shelf verdict can and cannot say is fixed in engine/shelf.ts: it can flag, it cannot clear.

import Anthropic from "@anthropic-ai/sdk";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import { hardRules } from "../engine/pipeline";
import { hasSubstance, type ProductFacts } from "../engine/product";
import { blockSignature, matchProduct, searchTerms, shelfVerdict, textBlocks, type KnownProduct, type ShelfBox } from "../engine/shelf";
import { answerCache, lookUpProduct, Memo, productOpinions, recogniseLinesIn, rememberedProductOpinions } from "./pipeline";

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
    const [lines, context] = await Promise.all([timed("text", recogniseLinesIn(image)), timed("context", ctx.runQuery(internal.shelfData.context, { deviceId }))]);
    // No text recognition configured, or it failed: say so rather than show an empty shelf as if nothing were there.
    if (!lines) return { boxes: [], ms: Date.now() - started, reading: false };
    const blocks = textBlocks(lines);
    const facts = new Map<string, ProductFacts>();
    for (const p of context.products) {
      try {
        facts.set(p.barcode, JSON.parse(p.facts) as ProductFacts);
      } catch {
        // A record that does not parse is as good as not known.
      }
    }
    const known: KnownProduct[] = [...facts].map(([key, f]) => ({ key, name: f.name, ...(f.brand ? { brand: f.brand } : {}) }));
    const named = blocks.map((b) => ({ block: b, product: matchProduct(b.text, known) }));

    // The models' careful reading of each recognised product, where it is already remembered.
    const watch = [...new Set(hardRules(context.rules).map((r) => r.tag))];
    const seen = [...new Set(named.flatMap((n) => (n.product ? [n.product.key] : [])))];
    const remembered = await timed("remembered", rememberedProductOpinions(answerCache(ctx), seen.map((k) => facts.get(k)!), watch));
    const opinions = new Map(seen.map((k, i) => [k, remembered[i]]));

    const boxes: ShelfBox[] = named.map(({ block, product }) => {
      if (!product) return { box: block.box, state: "unknown" };
      const f = facts.get(product.key)!;
      return { box: block.box, key: product.key, name: [f.brand, f.name].filter(Boolean).join(" "), ...shelfVerdict(f, context.rules, opinions.get(product.key) ?? null) };
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
    const stranger = named.find((n) => !n.product && searchTerms(n.block.text).length >= 2);
    // The product database asks for no more than a few searches a minute, whoever is asking.
    if (stranger && (await ctx.runMutation(internal.shelfData.claim, { key: "identify:any", ttlMs: 8_000 }))) {
      if (await ctx.runMutation(internal.shelfData.claim, { key: `identify:${blockSignature(stranger.block.text)}`, ttlMs: 10 * MINUTE })) {
        await ctx.scheduler.runAfter(0, internal.shelf.identify, { text: stranger.block.text });
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

/**
 * Try to find an unrecognised package in the product database from the words on its front. The database's text
 * search is loose, so its candidates are held to the same test as everything else: the package's words must match
 * one candidate clearly, and only one. A product that passes is fetched in full and becomes one of the known
 * products, so the next frame recognises it. Most attempts find nothing; that is expected and harmless.
 */
export const identify = internalAction({
  args: { text: v.string() },
  handler: async (ctx, { text }): Promise<string | null> => {
    const terms = searchTerms(text);
    if (terms.length < 2) return null;
    const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
    for (const [k, val] of Object.entries({ search_terms: terms.join(" "), search_simple: "1", action: "process", json: "1", page_size: "8", fields: "code,product_name,brands" })) url.searchParams.set(k, val);
    let found: { code?: string; product_name?: string; brands?: string }[] = [];
    try {
      const res = await fetch(url, { headers: { "User-Agent": "second-look/0.1" }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      found = ((await res.json()) as { products?: typeof found }).products ?? [];
    } catch (e) {
      console.error("shelf lookup failed", e);
      return null;
    }
    const candidates: KnownProduct[] = found.filter((p) => p.code && p.product_name?.trim()).map((p) => ({ key: p.code!, name: p.product_name!.trim(), ...(p.brands?.trim() ? { brand: p.brands.split(",")[0].trim() } : {}) }));
    const match = matchProduct(text, candidates);
    if (!match) return null;
    // Fetching it by barcode stores it with the known products (only if it has ingredients or allergens to go on).
    const facts = await lookUpProduct(ctx, match.key).catch(() => null);
    return facts && hasSubstance(facts) ? match.key : null;
  },
});
