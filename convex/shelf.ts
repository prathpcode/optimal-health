"use node";

// Packages on a shelf: point the scan camera along a shelf and see which packages are worth picking up.
//
// One still in, boxes out, about once a second. Each still is handled on its own (no tracking). The judge looks at
// the picture and says whether it shows no packaged product (nothing more is done), one (the judge boxes it), or
// several (the text is grouped into one block per package front, engine/shelf.ts). Each package's words are
// compared with the products the app already knows by barcode. A package it recognises is checked against the person's rules; one it
// does not is outlined and, in the background, identified so that a later frame knows it: the photo reader reads
// its front properly, the product database is searched for it, and the judge picks the record that is the same
// product (same variety included).
//
// What each shelf verdict means, and when a package may be shown as a good fit, is fixed in engine/shelf.ts.

import Anthropic from "@anthropic-ai/sdk";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import { tidyName } from "../engine/casing";
import { hardRules } from "../engine/pipeline";
import { hasSubstance, type ProductFacts } from "../engine/product";
import { blockSignature, frontHints, frontItems, looksLikeShelf, matchProduct, searchTerms, shelfVerdict, textBlocks, type KnownProduct, type ShelfBox } from "../engine/shelf";
import type { Box } from "../engine/types";
import { findProduct } from "./identify";
import { judgeItems, judgeScene } from "./judge";
import { answerCache, lookUpProduct, Memo, productOpinions, readPackages, recogniseLinesIn, rememberedProductOpinions } from "./pipeline";

/** A still is small on purpose (about 1300 px a side); anything much bigger is not from the app. */
const MAX_IMAGE_CHARS = 2_500_000;
const MINUTE = 60_000;

type Seen = { box: Box; text: string; whole?: boolean };

export const look = action({
  args: { deviceId: v.string(), image: v.string() },
  handler: async (ctx, { deviceId, image }): Promise<{ boxes: ShelfBox[]; ms: number; reading: boolean; shelf: boolean }> => {
    const started = Date.now();
    if (image.length > MAX_IMAGE_CHARS) throw new Error("That picture is too large");
    const steps: Record<string, number | string> = {};
    const timed = async <T>(what: string, p: Promise<T>): Promise<T> => {
      const t = Date.now();
      const out = await p;
      steps[what] = Date.now() - t;
      return out;
    };
    const done = (boxes: ShelfBox[], reading = true) => {
      console.log("shelf look", JSON.stringify({ ms: Date.now() - started, ...steps, boxes: boxes.length }));
      return { boxes, ms: Date.now() - started, reading, shelf: boxes.length > 0 };
    };

    // 1. What is the camera pointed at? The judge looks at the picture itself: no packaged product, one, or
    //    several. The camera asks all the time it is open, so "none" has to be cheap: it ends here, without the
    //    text being read at all.
    const [scene, context] = await Promise.all([timed("scene", judgeScene(image)), timed("context", ctx.runQuery(internal.shelfData.context, { deviceId }))]);
    if (scene) steps.sees = `${scene.count} ${scene.present.toFixed(2)}`;
    if (scene && (scene.count === "none" || scene.present < 0.6)) return done([]);

    const lines = await timed("text", recogniseLinesIn(image));
    // No text recognition configured, or it failed: say so rather than show an empty shelf as if nothing were there.
    if (!lines) return done([], false);

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

    // 2. The packages in view. One package: the judge's own box round it, and whatever words sit inside that box.
    //    Several: one per block of words (engine/shelf.ts), since the judge boxes one thing at a time.
    const blocks = textBlocks(lines);
    let packages: Seen[];
    if (scene?.count === "one" && scene.present >= 0.8 && scene.boxConfidence >= 0.5) {
      const b = scene.box;
      const inside = lines
        .filter((l) => (l.box.left + l.box.right) / 2 >= b.left && (l.box.left + l.box.right) / 2 <= b.right && (l.box.top + l.box.bottom) / 2 >= b.top && (l.box.top + l.box.bottom) / 2 <= b.bottom)
        .sort((x, y) => x.box.top - y.box.top || x.box.left - y.box.left);
      packages = [{ box: b, text: inside.map((l) => l.text).join(" "), whole: true }];
    } else {
      packages = blocks.map((bl) => ({ box: bl.box, text: bl.text }));
    }
    const named = packages.map((p) => ({ ...p, product: p.text ? matchProduct(p.text, known) : null }));
    const recognised = named.filter((n) => n.product).length;
    // Without the judge's word on the picture, fall back on the shape of the text to tell a shelf from a menu.
    if (!packages[0]?.whole && (scene ? named.length < 2 && !recognised : !looksLikeShelf(blocks, recognised))) return done([]);

    // 3. Recognised products: their real ingredients against the person's rules, with the models' careful reading
    //    of the ingredient list where that is already remembered.
    const hard = hardRules(context.rules);
    const watch = [...new Set(hard.map((r) => r.tag))];
    const seen = [...new Set(named.flatMap((n) => (n.product ? [n.product.key] : [])))];
    const remembered = await timed("remembered", rememberedProductOpinions(answerCache(ctx), seen.map((k) => facts.get(k)!), watch));
    const opinions = new Map(seen.map((k, i) => [k, remembered[i]]));

    // 4. Everything else gets a first colour straight away: the judge is asked, of the words on each front, what
    //    such a product commonly contains. It can raise a flag, never clear one, and it is shown as still being
    //    checked until the product has been identified and its real ingredients read.
    const strangers = named.map((n, i) => (!n.product && n.text.trim() ? i : -1)).filter((i) => i >= 0).slice(0, 12);
    const first = new Map<number, { state: "not_fit" | "cant_tell"; reason: string }>();
    if (hard.length && strangers.length) {
      const fronts = strangers.map((i) => named[i].text);
      const judged = await timed("firstColour", judgeItems(frontItems(fronts), hard));
      frontHints(fronts, context.rules, judged).forEach((hint, k) => hint && first.set(strangers[k], hint));
    }

    const boxes: ShelfBox[] = named.map((n, i) => {
      const whole = n.whole ? { whole: true } : {};
      if (n.product) {
        const f = facts.get(n.product.key)!;
        return { box: n.box, key: n.product.key, name: tidyName([f.brand, f.name].filter(Boolean).join(" ")), ...shelfVerdict(f, context.rules, opinions.get(n.product.key) ?? null), ...whole };
      }
      const hint = first.get(i);
      return hint ? { box: n.box, state: hint.state, reason: hint.reason, checking: true, ...whole } : { box: n.box, state: "unknown", ...whole };
    });

    // 5. In the background: read the ingredients of recognised products that have not been read for these rules
    //    yet, and have unrecognised packages identified. Each job is claimed first, so something held in view for
    //    ten seconds starts each job once, not ten times.
    const beforeJobs = Date.now();
    if (watch.length) {
      for (const key of seen.filter((k) => !opinions.get(k)).slice(0, 4)) {
        if (await ctx.runMutation(internal.shelfData.claim, { key: `read:${key}:${watch.join(",")}`, ttlMs: MINUTE })) {
          await ctx.scheduler.runAfter(0, internal.shelf.read, { barcode: key, watch });
        }
      }
    }
    // A single package is worth reading even with hardly any words on it; on a shelf, only fronts with enough
    // words to search for. The still is kept just long enough for the photo reader to look at it.
    const unknown = named.filter((n) => !n.product && (n.whole || searchTerms(n.text).length >= 2));
    const toIdentify = [...new Map(unknown.map((n) => [blockSignature(n.text) || "one-package-no-words", n.text.trim() || "(the one product in the picture; no words could be read off it)"])).entries()].slice(0, 6);
    if (toIdentify.length && process.env.ANTHROPIC_API_KEY && (await ctx.runMutation(internal.shelfData.claim, { key: "identify:any", ttlMs: unknown[0]?.whole ? 6_000 : 30_000 }))) {
      const fronts: string[] = [];
      for (const [signature, text] of toIdentify) {
        if (await ctx.runMutation(internal.shelfData.claim, { key: `identify:${signature}`, ttlMs: 10 * MINUTE })) fronts.push(text);
      }
      steps.toIdentify = fronts.length;
      if (fronts.length) {
        const imageId = await ctx.storage.store(new Blob([Buffer.from(image, "base64")], { type: "image/jpeg" }));
        await ctx.scheduler.runAfter(0, internal.shelf.identify, { imageId, fronts });
      }
    }
    steps.jobs = Date.now() - beforeJobs;
    return done(boxes);
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
      console.log("shelf read", JSON.stringify({ asked: fronts.length, read: readings.map((r) => [r.brand, r.name, r.variety].filter(Boolean).join(" / ")) }));
      // Several of the rough readings are usually the same product, standing in a row: look each product up once.
      const distinct = [...new Map(readings.map((r) => [blockSignature([r.brand, r.name, r.variety].join(" ")), r])).values()];
      for (const reading of distinct.slice(0, 3)) {
        const front = [reading.brand, reading.name, reading.variety].filter(Boolean).join(" ");
        const { matches, searched, offered } = await findProduct(reading);
        // The first accepted record that has ingredients or allergens to go on. Fetching it by barcode stores it
        // with the known products; it is then remembered under the words on its front.
        let kept: string | null = null;
        for (const match of matches.slice(0, 4)) {
          const facts = await lookUpProduct(ctx, match.key).catch(() => null);
          if (facts && hasSubstance(facts)) {
            await ctx.runMutation(internal.shelfData.nameFront, { barcode: match.key, name: [reading.name, reading.variety].filter(Boolean).join(" "), ...(reading.brand ? { brand: reading.brand } : {}) });
            kept = `${match.brand ?? ""} ${match.name}`.trim();
            identified++;
            break;
          }
        }
        console.log("shelf identify", JSON.stringify({ front, searches: searched, candidates: offered, accepted: matches.length, kept }));
        await new Promise((r) => setTimeout(r, 2000));
      }
    } catch (e) {
      console.error("shelf identify failed", e);
    } finally {
      await ctx.storage.delete(imageId).catch(() => {});
    }
    return identified;
  },
});
