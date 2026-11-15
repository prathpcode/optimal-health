// Put two photo-reading models side by side on the same photos, before trusting a faster one.
//   node bench/compareReaders.mjs photo1.jpg photo2.jpg ... [--fast claude-haiku-5-5] [--base <model>] [--write]
// Reading the photo is the only step that sees it: a dish the reader drops is invisible to every later check. So
// the faster model passes on a photo only if it loses nothing the current reader found. Use photos taken on a
// phone, in the light and at the angles people really scan in; generated images are too easy.
// Each photo costs two reading calls. --base defaults to the reader the backend is configured with.
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { promisify } from "node:util";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const run = promisify(execFile);
const args = process.argv.slice(2);
const flag = (name, dflt) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : dflt);
const fast = flag("fast", "claude-haiku-5-5");
const base = flag("base", null);
const photos = args.filter((a, i) => !a.startsWith("--") && !["--fast", "--base"].includes(args[i - 1]));
if (!photos.length) throw new Error("usage: node bench/compareReaders.mjs photo1.jpg [photo2.jpg ...] [--fast model] [--base model] [--write]");

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const client = new ConvexHttpClient(env.EXPO_PUBLIC_CONVEX_URL);

async function read(imageId, model) {
  const { stdout } = await run("npx", ["convex", "run", "bench:transcribePhoto", JSON.stringify({ imageId, ...(model ? { model } : {}) })], { maxBuffer: 32 * 1024 * 1024 });
  return JSON.parse(stdout.slice(stdout.indexOf("{")));
}

// Compare what was read, not how it was typed: case, punctuation and spacing do not count.
const norm = (s) => (s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
const LABEL_TEXT = ["productName", "brand", "panel", "ingredientsText", "containsStatement", "mayContainStatement", "servingSize"];
const LABEL_NUMBERS = ["sodiumMg", "potassiumMg", "totalSugarG", "addedSugarG", "saturatedFatG", "carbsG", "proteinG", "fiberG", "calories"];

function compare(a, b) {
  const problems = [], notes = [];
  if (a.kind !== b.kind) problems.push(`read as "${b.kind}" instead of "${a.kind}"`);
  const mine = new Map(b.dishes.map((d) => [norm(d.name), d]));
  for (const d of a.dishes) {
    const other = mine.get(norm(d.name));
    if (!other) problems.push(`lost the dish "${d.name}"`);
    else if (norm(d.description) !== norm(other.description)) problems.push(`"${d.name}": description differs ("${d.description}" / "${other.description}")`);
  }
  const theirs = new Set(a.dishes.map((d) => norm(d.name)));
  for (const d of b.dishes) if (!theirs.has(norm(d.name))) notes.push(`extra dish "${d.name}"`);
  for (const f of LABEL_TEXT) if (norm(a.label[f]) !== norm(b.label[f])) problems.push(`label ${f} differs ("${String(a.label[f]).slice(0, 80)}" / "${String(b.label[f]).slice(0, 80)}")`);
  for (const f of LABEL_NUMBERS) if (a.label[f] !== b.label[f]) problems.push(`label ${f}: ${a.label[f]} / ${b.label[f]}`);
  for (const f of ["doNotUse", "askDoctor", "askDoctorOrPharmacist", "stopUse"]) if (norm(a.label.warnings[f]) !== norm(b.label.warnings[f])) problems.push(`warning "${f}" differs`);
  const actives = (x) => x.label.activeIngredients.map((i) => norm(`${i.name} ${i.amount}`)).sort().join("|");
  if (actives(a) !== actives(b)) problems.push("active ingredients differ");
  if (norm(a.restaurantName) !== norm(b.restaurantName)) notes.push(`restaurant name: "${a.restaurantName}" / "${b.restaurantName}"`);
  return { problems, notes };
}

const rows = [];
for (const file of photos) {
  const uploadUrl = await client.mutation(api.scans.generateUploadUrl, {});
  const up = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg" }, body: readFileSync(file) });
  const { storageId } = await up.json();
  const [a, b] = await Promise.all([read(storageId, base), read(storageId, fast)]);
  rows.push({ file: basename(file), a, b, ...compare(a.read, b.read) });
  process.stderr.write(`  ${rows.length}/${photos.length} photos\r`);
}

const passed = rows.filter((r) => !r.problems.length).length;
const avg = (k) => (rows.reduce((s, r) => s + r[k].ms, 0) / rows.length / 1000).toFixed(1);
const out = [
  `# Photo readers compared: ${rows[0].a.model} and ${rows[0].b.model}`,
  "",
  `- ${new Date().toISOString().slice(0, 16)}Z, ${rows.length} photo${rows.length === 1 ? "" : "s"}.`,
  `- Average time to read a photo: ${avg("a")} s (${rows[0].a.model}), ${avg("b")} s (${rows[0].b.model}).`,
  `- ${passed} of ${rows.length} photos read with nothing lost or changed by ${rows[0].b.model}. Case, punctuation and spacing are ignored.`,
  "",
  ...rows.flatMap((r) => [
    `## ${r.file}`,
    "",
    `- ${r.a.model}: ${r.a.read.kind}, ${r.a.read.dishes.length} dishes, ${(r.a.ms / 1000).toFixed(1)} s`,
    `- ${r.b.model}: ${r.b.read.kind}, ${r.b.read.dishes.length} dishes, ${(r.b.ms / 1000).toFixed(1)} s`,
    ...(r.problems.length ? r.problems.map((p) => `- DIFFERENT: ${p}`) : ["- Same content."]),
    ...r.notes.map((n) => `- note: ${n}`),
    "",
  ]),
].join("\n");
console.log(out);
if (args.includes("--write")) {
  const target = `bench/reports/${new Date().toISOString().slice(0, 10)}-readers.md`;
  writeFileSync(target, out);
  console.error(`written: ${target}`);
}
process.exitCode = passed === rows.length ? 0 : 1;
