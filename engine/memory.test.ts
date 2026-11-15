import { describe, expect, it } from "vitest";
import { applyRemembered, dishKey, positionsFor, restaurantId, type RememberedAnswer } from "./memory";
import { evaluate } from "./evaluate";
import type { HardCheck, Item, Rule } from "./types";

const NUTS: Rule = { id: "nuts", level: "never", tag: "tree_nuts", reason: "t", source: { title: "t", url: "u" }, from: { type: "allergy", label: "tree nut allergy" }, status: "library", enabled: true };
const pesto: Item = { id: "d1", kind: "dish", name: "Pesto Linguine", description: "basil pesto, parmesan", ingredients: [], tags: [] };
const check: HardCheck = { itemId: "d1", ruleId: "nuts", code: "hides_in", judgeP: null, reader: "maybe" };
const now = new Date("2026-11-14T20:00:00Z");
const ans = (over: Partial<RememberedAnswer>): RememberedAnswer => ({ dishKey: dishKey(pesto), tag: "tree_nuts", value: "no", deviceId: "me", at: "2026-11-10T19:00:00Z", ...over });
const fit = (remembered: RememberedAnswer[], device = "me") => evaluate(pesto, [NUTS], applyRemembered([check], [pesto], [NUTS], remembered, device, now)).fit;

describe("restaurantId", () => {
  it("needs both a name and a location", () => {
    expect(restaurantId("The Olive Branch", { lat: 37.42741, lng: -122.16972 })).toBe("the-olive-branch@37.427,-122.170");
    expect(restaurantId("", { lat: 1, lng: 2 })).toBeNull();
    expect(restaurantId("The Olive Branch", undefined)).toBeNull();
  });
  it("is the same a few metres away and different across town", () => {
    const a = restaurantId("Cafe", { lat: 37.42741, lng: -122.16972 });
    expect(restaurantId("CAFÉ", { lat: 37.42744, lng: -122.16968 })).toBe(a);
    expect(restaurantId("Cafe", { lat: 37.45, lng: -122.16972 })).not.toBe(a);
  });
});

describe("applyRemembered", () => {
  it("with nothing remembered, the dish is still a question", () => {
    expect(fit([])).toBe("cant_tell");
  });
  it("my own recent 'no' clears the question for me", () => {
    expect(fit([ans({})])).toBe("good");
  });
  it("my own 'no' expires after 30 days", () => {
    expect(fit([ans({ at: "2026-10-01T19:00:00Z" })])).toBe("cant_tell");
  });
  it("someone else's 'no' does nothing for me", () => {
    expect(fit([ans({ deviceId: "someone-else" })])).toBe("cant_tell");
  });
  it("anyone's 'yes' blocks the dish for everyone, however old", () => {
    expect(fit([ans({ value: "yes", deviceId: "someone-else", at: "2025-01-01T00:00:00Z" })])).toBe("not_fit");
  });
  it("a 'yes' beats my own 'no'", () => {
    expect(fit([ans({}), ans({ value: "yes", deviceId: "someone-else" })])).toBe("not_fit");
  });
  it("lets a 'yes' travel up to what a tag implies and a 'no' travel down, never the other way", () => {
    const MEAT: Rule = { ...NUTS, id: "meat", tag: "meat" };
    const PORK: Rule = { ...NUTS, id: "pork", tag: "pork" };
    const ramen: Item = { id: "d1", kind: "dish", name: "Ramen", ingredients: [], tags: [] };
    const base = (ruleId: string): HardCheck => ({ itemId: "d1", ruleId, code: "hides_in", judgeP: null, reader: "maybe" });
    const run = (rule: Rule, a: Partial<RememberedAnswer>) =>
      evaluate(ramen, [rule], applyRemembered([base(rule.id)], [ramen], [rule], [ans({ dishKey: dishKey(ramen), ...a })], "me", now)).fit;
    expect(run(MEAT, { tag: "pork", value: "no" })).toBe("cant_tell"); // no pork is not no meat
    expect(run(PORK, { tag: "meat", value: "no" })).toBe("good"); // no meat is no pork
    expect(run(MEAT, { tag: "pork", value: "yes" })).toBe("not_fit"); // pork is meat
    expect(run(PORK, { tag: "meat", value: "yes" })).toBe("cant_tell"); // meat is not necessarily pork
  });
  it("does not carry over to a reworded dish or another allergen", () => {
    expect(fit([ans({ dishKey: dishKey({ name: "Pesto Linguine", description: "nut-free basil pesto" }) })])).toBe("cant_tell");
    expect(fit([ans({ tag: "peanuts" })])).toBe("cant_tell");
  });
});

describe("positionsFor", () => {
  const box = (n: number) => ({ top: n / 10, left: 0.1, bottom: n / 10 + 0.05, right: 0.9 });
  const lines = [
    { text: "MAINS", box: box(0) },
    { text: "Grilled Salmon  26", box: box(1) },
    { text: "lemon, fresh herbs, steamed jasmine rice", box: box(2) },
    { text: "Pesto Linguine  19", box: box(3) },
    { text: "basil pesto, cherry tomatoes, parmesan", box: box(4) },
    { text: "Fresh Lemonade  5", box: box(5) },
  ];
  it("boxes the name line and the description lines under it", () => {
    const pos = positionsFor(
      [{ name: "Grilled Salmon", description: "lemon, fresh herbs, steamed jasmine rice" }, { name: "Pesto Linguine", description: "basil pesto, cherry tomatoes, parmesan" }, { name: "Fresh Lemonade" }],
      lines,
    );
    expect(pos[0]).toEqual([box(1), box(2)]);
    expect(pos[1]).toEqual([box(3), box(4)]);
    expect(pos[2]).toEqual([box(5)]);
  });
  it("gives no box to a dish whose words are not on the photo", () => {
    expect(positionsFor([{ name: "Lobster Thermidor" }], lines)).toEqual([undefined]);
  });
  it("does not give two dishes the same line", () => {
    const twice = positionsFor([{ name: "Fresh Lemonade" }, { name: "Fresh Lemonade" }], lines);
    expect(twice[0]).toEqual([box(5)]);
    expect(twice[1]).toBeUndefined();
  });
});
