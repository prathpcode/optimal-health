"use node";

import Anthropic from "@anthropic-ai/sdk";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { evaluate } from "../engine/evaluate";
import { buildChecks } from "../engine/pipeline";
import { tagLabel } from "../engine/tags";
import { linesFromVision, type VisionText } from "../engine/textLines";
import type { Rule } from "../engine/types";
import { judgeAvailable, judgeItems } from "./judge";
import { readerModel, tagAndCheck, transcribe } from "./pipeline";

type Outcome = "blocked" | "ask" | "clear";

/**
 * For the benchmark: run dish text through the same tagging, per-rule check and judge the app uses, with one Never
 * rule per tag, and report what the evaluator would do. Variants show what each check contributes.
 * Run with `node bench/run.mjs`; not called by the app.
 */
export const judgeDishes = internalAction({
  args: { dishes: v.array(v.object({ name: v.string(), description: v.string() })), tags: v.array(v.string()) },
  handler: async (_ctx, { dishes, tags }) => {
    const client = new Anthropic();
    const rules: Rule[] = tags.map((tag) => ({
      id: `bench:${tag}`, level: "never", tag, reason: "benchmark", source: { title: "benchmark", url: "bench://" },
      from: { type: "allergy", label: `${tagLabel(tag)} allergy` }, status: "unverified", enabled: true,
    }));
    const { items, opinions } = await tagAndCheck(client, dishes, tags);
    const judged = await judgeItems(items, rules);
    const outcomeOf = (fit: string): Outcome => (fit === "not_fit" ? "blocked" : fit === "cant_tell" ? "ask" : "clear");
    const variants = {
      full: buildChecks(items, rules, opinions, judged),
      no_judge: buildChecks(items, rules, opinions, []),
      no_second_pass: buildChecks(items, rules, [], judged),
      code_and_tags_only: buildChecks(items, rules, [], []),
    };
    return {
      judge: judgeAvailable(),
      results: items.map((item, i) => ({
        name: dishes[i].name,
        perTag: tags.map((tag) => {
          const rule = rules.find((r) => r.tag === tag)!;
          const check = variants.full.find((c) => c.itemId === item.id && c.ruleId === rule.id)!;
          const out: Record<string, Outcome> = {};
          for (const [name, checks] of Object.entries(variants)) out[name] = outcomeOf(evaluate(item, [rule], checks).fit);
          return { tag, code: check.code, reader: check.reader, judgeP: check.judgeP, outcomes: out };
        }),
      })),
    };
  },
});

/**
 * For bench/compareReaders.mjs: read one stored photo with a named model (or the configured reader) and report what
 * it read and how long it took. Not called by the app.
 */
export const transcribePhoto = internalAction({
  args: { imageId: v.id("_storage"), model: v.optional(v.string()) },
  handler: async (ctx, { imageId, model }) => {
    const url = await ctx.storage.getUrl(imageId);
    if (!url) throw new Error("Photo not found");
    const started = Date.now();
    const read = await transcribe(new Anthropic(), [url], model);
    return { model: model ?? readerModel(), ms: Date.now() - started, read };
  },
});

/**
 * For trying shelf photos: what the text-recognition service finds on one stored photo. Returns the objects it
 * boxes (it has a "Packaged goods" class), any logos, and every line of text with its position. Not called by the app.
 */
export const shelfProbe = internalAction({
  args: { imageId: v.id("_storage") },
  handler: async (ctx, { imageId }) => {
    const key = process.env.GOOGLE_VISION_API_KEY;
    if (!key) throw new Error("GOOGLE_VISION_API_KEY is not set");
    const url = await ctx.storage.getUrl(imageId);
    if (!url) throw new Error("Photo not found");
    const content = Buffer.from(await (await fetch(url)).arrayBuffer()).toString("base64");
    const started = Date.now();
    const res = await fetch("https://vision.googleapis.com/v1/images:annotate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
      body: JSON.stringify({ requests: [{ image: { content }, features: [{ type: "OBJECT_LOCALIZATION", maxResults: 100 }, { type: "LOGO_DETECTION", maxResults: 30 }, { type: "DOCUMENT_TEXT_DETECTION" }] }] }),
    });
    if (!res.ok) throw new Error(`vision ${res.status}: ${(await res.text()).slice(0, 300)}`);
    type Poly = { normalizedVertices?: { x?: number; y?: number }[]; vertices?: { x?: number; y?: number }[] };
    const data = (await res.json()) as {
      responses?: { localizedObjectAnnotations?: { name: string; score: number; boundingPoly: Poly }[]; logoAnnotations?: { description: string; score: number; boundingPoly: Poly }[]; fullTextAnnotation?: VisionText; error?: { message?: string } }[];
    };
    const r = data.responses?.[0] ?? {};
    return {
      ms: Date.now() - started,
      error: r.error?.message ?? null,
      objects: (r.localizedObjectAnnotations ?? []).map((o) => ({ name: o.name, score: o.score, corners: (o.boundingPoly.normalizedVertices ?? []).map((p) => ({ x: p.x ?? 0, y: p.y ?? 0 })) })),
      logos: (r.logoAnnotations ?? []).map((l) => ({ name: l.description, score: l.score, corners: (l.boundingPoly.vertices ?? []).map((p) => ({ x: p.x ?? 0, y: p.y ?? 0 })) })),
      lines: linesFromVision(r.fullTextAnnotation),
    };
  },
});
