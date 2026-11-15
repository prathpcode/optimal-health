import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Memo, type AnswerCache } from "./pipeline";

const Schema = z.object({ flagged: z.array(z.object({ index: z.number() })) });

/** A stand-in for the model: counts calls and answers (or fails) as told. */
function fakeClient(answer: unknown) {
  const state = { calls: 0 };
  const client = {
    messages: {
      parse: async () => {
        state.calls++;
        if (answer instanceof Error) throw answer;
        return { stop_reason: "end_turn", parsed_output: answer };
      },
    },
  } as unknown as Anthropic;
  return { client, state };
}

function fakeCache(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const cache: AnswerCache = {
    get: async (keys) => new Map(keys.filter((k) => store.has(k)).map((k) => [k, store.get(k)!])),
    put: async (entries) => {
      for (const e of entries) store.set(e.key, e.value);
    },
  };
  return { cache, store };
}

const REQUEST = { step: "check" as const, system: "Second check.", text: "Thing to watch for: tree nuts.\n\nDishes:\n1. Pesto pasta" };

async function run(client: Anthropic, cache: AnswerCache | null, request = REQUEST) {
  const memo = new Memo(client, cache);
  await memo.prime([request]);
  const answer = await memo.ask(request.step, Schema, request.system, request.text);
  await memo.flush();
  return answer;
}

describe("Memo", () => {
  it("asks the model once, then answers the identical request from the cache", async () => {
    const { cache, store } = fakeCache();
    const model = fakeClient({ flagged: [{ index: 1 }] });
    expect(await run(model.client, cache)).toEqual({ flagged: [{ index: 1 }] });
    expect(store.size).toBe(1);
    expect(await run(model.client, cache)).toEqual({ flagged: [{ index: 1 }] });
    expect(model.state.calls).toBe(1);
  });
  it("asks again when the menu text or the instructions differ at all", async () => {
    const { cache } = fakeCache();
    const model = fakeClient({ flagged: [] });
    await run(model.client, cache);
    await run(model.client, cache, { ...REQUEST, text: `${REQUEST.text}\n2. Walnut salad` });
    await run(model.client, cache, { ...REQUEST, system: "Second check, reworded." });
    expect(model.state.calls).toBe(3);
  });
  it("does not remember a call that failed", async () => {
    const { cache, store } = fakeCache();
    await expect(run(fakeClient(new Error("overloaded")).client, cache)).rejects.toThrow();
    expect(store.size).toBe(0);
  });
  it("replaces a stored answer that no longer has the expected shape", async () => {
    const first = fakeCache();
    await run(fakeClient({ flagged: [] }).client, first.cache);
    const [key] = [...first.store.keys()];
    const { cache, store } = fakeCache({ [key]: JSON.stringify({ something: "else" }) });
    const model = fakeClient({ flagged: [{ index: 2 }] });
    expect(await run(model.client, cache)).toEqual({ flagged: [{ index: 2 }] });
    expect(model.state.calls).toBe(1);
    expect(JSON.parse(store.get(key)!)).toEqual({ flagged: [{ index: 2 }] });
  });
  it("carries on without the cache when it cannot be read or written", async () => {
    const broken: AnswerCache = {
      get: async () => {
        throw new Error("down");
      },
      put: async () => {
        throw new Error("down");
      },
    };
    const model = fakeClient({ flagged: [] });
    expect(await run(model.client, broken)).toEqual({ flagged: [] });
    expect(model.state.calls).toBe(1);
  });
  it("with no cache, always asks the model (the benchmark's path)", async () => {
    const model = fakeClient({ flagged: [] });
    await run(model.client, null);
    await run(model.client, null);
    expect(model.state.calls).toBe(2);
  });
});
