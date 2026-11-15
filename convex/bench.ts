"use node";

import Anthropic from "@anthropic-ai/sdk";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { evaluate } from "../engine/evaluate";
import { buildChecks } from "../engine/pipeline";
import { tagLabel } from "../engine/tags";
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
