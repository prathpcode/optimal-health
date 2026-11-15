// Score the pipeline against a chain's published allergen declarations.
//   node bench/run.mjs [--data bench/data/chick-fil-a.json] [--n 96] [--seed 1] [--batch 12]
// The dish NAMES are the only input; the chain's own declarations are the truth.
// For an allergy the question is: when the dish really contains it, did we block it or ask about it?
// A "miss" is a dish that contains the allergen and that we let through with no flag and no question.
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";

const run = promisify(execFile);
const arg = (name, dflt) => (process.argv.includes(`--${name}`) ? process.argv[process.argv.indexOf(`--${name}`) + 1] : dflt);
const dataPath = arg("data", "bench/data/chick-fil-a.json");
const N = Number(arg("n", 96));
const BATCH = Number(arg("batch", 12));
let seed = Number(arg("seed", 1));
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

const data = JSON.parse(readFileSync(dataPath, "utf8"));
const pool = [...data.items];
for (let i = pool.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [pool[i], pool[j]] = [pool[j], pool[i]];
}
const sample = pool.slice(0, Math.min(N, pool.length));
const batches = [];
for (let i = 0; i < sample.length; i += BATCH) batches.push(sample.slice(i, i + BATCH));

async function runBatch(batch, attempt = 1) {
  const payload = JSON.stringify({ dishes: batch.map((d) => ({ name: d.name, description: d.description ?? "" })), tags: data.tags });
  try {
    const { stdout } = await run("npx", ["convex", "run", "bench:judgeDishes", payload], { maxBuffer: 32 * 1024 * 1024 });
    return JSON.parse(stdout.slice(stdout.indexOf("{")));
  } catch (e) {
    if (attempt < 3) return runBatch(batch, attempt + 1);
    throw e;
  }
}

const t0 = Date.now();
const results = [];
let judge = false;
for (let i = 0; i < batches.length; i += 3) {
  const group = batches.slice(i, i + 3);
  const outs = await Promise.all(group.map((b) => runBatch(b)));
  outs.forEach((out, k) => {
    judge = judge || out.judge;
    out.results.forEach((r, idx) => results.push({ ...r, truth: group[k][idx].truth }));
  });
  process.stderr.write(`  ${Math.min(results.length, sample.length)}/${sample.length} dishes\r`);
}

const variants = ["full", "no_judge", "no_second_pass", "code_and_tags_only"];
const score = (variant) => {
  const perTag = {};
  for (const tag of data.tags) perTag[tag] = { positives: 0, blocked: 0, asked: 0, missed: [], negatives: 0, flagged: [] };
  for (const r of results) {
    for (const t of r.perTag) {
      const s = perTag[t.tag];
      const outcome = t.outcomes[variant];
      if (r.truth[t.tag]) {
        s.positives++;
        if (outcome === "blocked") s.blocked++;
        else if (outcome === "ask") s.asked++;
        else s.missed.push(r.name);
      } else {
        s.negatives++;
        if (outcome !== "clear") s.flagged.push(r.name);
      }
    }
  }
  return perTag;
};
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : "n/a");

const lines = [];
lines.push(`# Allergen benchmark: ${data.chain}`, "");
lines.push(`- Run: ${new Date().toISOString().slice(0, 16)}Z, ${results.length} dishes sampled from ${data.items.length} (seed ${arg("seed", 1)}), ${((Date.now() - t0) / 1000).toFixed(0)} s.`);
lines.push(`- Truth: ${data.source} (fetched ${data.fetched}). ${data.note}`);
lines.push(`- Judge (Jev): ${judge ? "on" : "off (no key set); the 'full' and 'no_judge' columns are therefore identical"}.`);
lines.push(`- Each allergen is tested as a Never rule. "Caught" = blocked or turned into a question. "Missed" = contains it, and we raised nothing.`, "");
for (const variant of variants) {
  if (!judge && (variant === "no_judge" || variant === "no_second_pass")) continue;
  const s = score(variant);
  const label = { full: "Everything on", no_judge: "Without the judge", no_second_pass: "Without the per-rule second pass", code_and_tags_only: "Code matching and first-pass tags only" }[variant];
  lines.push(`## ${label}`, "", "| Allergen | Contain it | Caught | of which blocked | Missed | Do not contain it | Flagged anyway |", "| --- | --- | --- | --- | --- | --- | --- |");
  let P = 0, C = 0, M = 0, Ng = 0, F = 0;
  for (const tag of data.tags) {
    const x = s[tag];
    P += x.positives; C += x.blocked + x.asked; M += x.missed.length; Ng += x.negatives; F += x.flagged.length;
    lines.push(`| ${tag} | ${x.positives} | ${pct(x.blocked + x.asked, x.positives)} | ${x.blocked} | ${x.missed.length} | ${x.negatives} | ${x.flagged.length} (${pct(x.flagged.length, x.negatives)}) |`);
  }
  lines.push(`| **all** | ${P} | **${pct(C, P)}** |  | **${M}** | ${Ng} | ${F} (${pct(F, Ng)}) |`, "");
  const missed = data.tags.flatMap((tag) => s[tag].missed.map((n) => `${n} (${tag})`));
  lines.push(missed.length ? `Missed: ${missed.join("; ")}` : "Missed: none", "");
}
lines.push("## Read this with care", "");
lines.push("- One chain, fast food, names only. A menu with descriptions gives the pipeline more to work with; an unfamiliar independent restaurant gives it less.");
lines.push("- The reader may already know this chain's menu, which flatters the score.");
lines.push("- Allergens only. This says nothing about drug-food rules or nutrient limits.");
lines.push("- \"Flagged anyway\" includes cases where caution is arguably right (shared fryers, peanut oil) but the chain does not declare the allergen.");
const report = lines.join("\n");
mkdirSync("bench/reports", { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
writeFileSync(`bench/reports/${stamp}-${data.chain.toLowerCase().replace(/[^a-z]+/g, "-")}${judge ? "-judge" : ""}.md`, report + "\n");
writeFileSync(`bench/reports/${stamp}-${data.chain.toLowerCase().replace(/[^a-z]+/g, "-")}${judge ? "-judge" : ""}.json`, JSON.stringify({ n: results.length, judge, results }, null, 1));
console.log("\n" + report);
