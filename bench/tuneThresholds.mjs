// Work out which probability bands for the judge the benchmark supports, for Never rules.
//   node bench/tuneThresholds.mjs [bench/reports/<date>-<chain>-judge.json] [--write]
// It reports; it does not change engine/evaluate.ts. Whether to adopt the bands is a product decision (see the
// report's last section).
// No model calls: it only reads the probabilities and the chain's own allergen declarations stored in the report.
//
// The bands (engine/evaluate.ts, DEFAULT_THRESHOLDS) turn a probability into a vote: at or above `high` is "yes",
// at or below `low` is "no", in between is "maybe". The judge only drives the fast provisional verdicts, so the
// question each band answers is about what a person sees for the few seconds before the careful check lands:
//   low  - how often would a dish that really contains the allergen be shown, provisionally, with no flag?
//   high - how often would a dish that does not contain it be shown, provisionally, as "Not a fit"?
// Dishes are split in two by position: bands are chosen on one half and reported on the other, which they never saw.
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith("--")) ?? "bench/reports/2026-11-15-chick-fil-a-judge.json";
const report = JSON.parse(readFileSync(path, "utf8"));
if (!report.judge) throw new Error("This report was run without the judge; there are no probabilities to tune on.");

const cases = (dishes) =>
  dishes.flatMap((r) => r.perTag.filter((t) => typeof t.judgeP === "number").map((t) => ({ dish: r.name, tag: t.tag, p: t.judgeP, real: !!r.truth[t.tag], code: t.code })));
const tune = cases(report.results.filter((_, i) => i % 2 === 0));
const held = cases(report.results.filter((_, i) => i % 2 === 1));

const count = (set, real, test) => set.filter((c) => c.real === real && test(c.p)).length;
const total = (set, real) => set.filter((c) => c.real === real).length;
const grid = Array.from({ length: 100 }, (_, i) => i / 100);

// low: the highest value at which no real case in the tuning half would be voted "no".
const low = [...grid].reverse().find((x) => count(tune, true, (p) => p <= x) === 0) ?? 0;
// high: the lowest value at which at least 95% of the tuning half's "yes" votes are real cases.
const precision = (set, x) => {
  const yes = count(set, true, (p) => p >= x), wrong = count(set, false, (p) => p >= x);
  return yes + wrong ? yes / (yes + wrong) : 1;
};
const high = grid.find((x) => x > low && precision(tune, x) >= 0.95) ?? 0.99;

/** Real cases the provisional pass would show as a fit: the judge votes "no" and code finds nothing in the dish's words. */
const shownAsFit = (set) => set.filter((c) => c.real && c.p <= 0.1 && c.code === "no_match").length;
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : "n/a");
const row = (name, band, set) => {
  const realNo = count(set, true, (p) => p <= band.low), freeNo = count(set, false, (p) => p <= band.low);
  const realYes = count(set, true, (p) => p >= band.high), freeYes = count(set, false, (p) => p >= band.high);
  return `| ${name} | ${band.low} / ${band.high} | ${realNo} of ${total(set, true)} (${pct(realNo, total(set, true))}) | ${freeNo} of ${total(set, false)} (${pct(freeNo, total(set, false))}) | ${realYes} of ${total(set, true)} (${pct(realYes, total(set, true))}) | ${freeYes} of ${total(set, false)} (${pct(freeYes, total(set, false))}) |`;
};
const before = { low: 0.1, high: 0.5 };
const after = { low, high };
const head = "| Bands | low / high | Real cases voted \"no\" | Allergen-free cases voted \"no\" | Real cases voted \"yes\" | Allergen-free cases voted \"yes\" |\n| --- | --- | --- | --- | --- | --- |";
const lowest = [...tune, ...held].filter((c) => c.real).sort((a, b) => a.p - b.p).slice(0, 8);

const out = [
  `# Judge bands for Never rules`,
  "",
  `- From ${path} (${report.results.length} dishes; ${total([...tune, ...held], true)} dish-and-allergen pairs that really contain the allergen, ${total([...tune, ...held], false)} that do not).`,
  `- Chosen on the even-numbered dishes, reported on the odd-numbered ones.`,
  `- low: the highest value at which no real case in the tuning half is voted "no". high: the lowest value at which at least 95% of the tuning half's "yes" votes are real.`,
  `- The data supports: low ${low}, high ${high}. In use: ${before.low} / ${before.high}.`,
  "",
  "## Tuning half",
  "",
  head,
  row("in use", before, tune),
  row("supported", after, tune),
  "",
  "## Held-out half",
  "",
  head,
  row("in use", before, held),
  row("supported", after, held),
  "",
  "## The real cases the judge scored lowest",
  "",
  ...lowest.map((c) => `- ${c.p.toFixed(2)}  ${c.dish}: ${c.tag}`),
  "",
  "## What follows from this",
  "",
  `- With the bands in use, the judge votes "no" on ${count(held, true, (p) => p <= before.low)} of the ${total(held, true)} held-out dish-and-allergen pairs that really contain the allergen (${pct(count(held, true, (p) => p <= before.low), total(held, true))}). The provisional pass also runs the code check on the dish's own words; here it finds something in ${count(held, true, (p) => p <= before.low) - shownAsFit(held)} of them. The remaining ${shownAsFit(held)} are shown as a fit, with only the standing "confirm" reminder, until the careful check lands.`,
  `- A "no" band that makes no such mistake is almost empty: at ${low} it covers ${pct(count(held, false, (p) => p <= low), total(held, false))} of the allergen-free cases. The judge's low scores do not separate the two groups, so it cannot serve as a "no" voter. Adopting that band means the provisional pass shows "Can't tell" for nearly every dish it does not block, and, were the judge ever switched into final verdicts, it would turn almost every cleared dish into a question.`,
  `- Raising high from ${before.high} to ${high} cuts wrong provisional "Not a fit" calls from ${pct(count(held, false, (p) => p >= before.high), total(held, false))} to ${pct(count(held, false, (p) => p >= high), total(held, false))} of allergen-free cases, and moves ${count(held, true, (p) => p >= before.high) - count(held, true, (p) => p >= high)} real cases from "Not a fit" to a question.`,
  "",
  "## What this does and does not show",
  "",
  `- These bands apply to Never rules only. The benchmark tests every allergen as a Never rule, so it says nothing about Avoid rules; those keep their starting bands.`,
  `- One fast-food chain, dish names with no descriptions. A menu with descriptions gives the judge more to go on and may support different bands.`,
  `- The judge does not feed final verdicts (JUDGE_ENABLED is off), so these bands change only what is shown while a scan is still being checked.`,
  "",
].join("\n");

console.log(out);
if (args.includes("--write")) {
  const target = path.replace(/-judge\.json$/, "-thresholds.md");
  writeFileSync(target, out);
  console.error(`written: ${target}`);
}
