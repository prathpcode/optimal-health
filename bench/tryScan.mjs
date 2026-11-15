// Run one photo and/or barcode through the live backend and print the result.
//   node bench/tryScan.mjs path/to/photo.jpg [--barcode 0123456789012] [--profile demo|none] [--json]
// "demo" (default) sets up a test device with: tree nut allergy, simvastatin (rules read from its label), limit sodium.
import { readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const args = process.argv.slice(2);
const barcode = args.includes("--barcode") ? args[args.indexOf("--barcode") + 1] : null;
const file = args[0] && !args[0].startsWith("--") ? args[0] : null;
const rest = args;
if (!file && !barcode) throw new Error("usage: node bench/tryScan.mjs [photo] [--barcode 0123456789012] [--profile demo|none] [--json]");
const profileName = rest.includes("--profile") ? rest[rest.indexOf("--profile") + 1] : "demo";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const client = new ConvexHttpClient(env.EXPO_PUBLIC_CONVEX_URL);
const deviceId = `tryscan-${rest.includes("--device") ? rest[rest.indexOf("--device") + 1] : profileName}`;

const listArg = (name) => (rest.includes(`--${name}`) ? rest[rest.indexOf(`--${name}`) + 1].split(",").map((x) => x.trim()).filter(Boolean) : null);
const meds = listArg("meds"), conds = listArg("conditions"), allergies = listArg("allergies");
if (meds || conds || allergies) {
  // A custom profile: --meds "apixaban,Tylenol" --conditions "Crohns disease" --allergies "tree_nuts"
  await client.mutation(api.profile.save, { deviceId, profile: { medications: (meds ?? []).map((name) => ({ name })), conditions: (conds ?? []).map((name) => ({ name })), allergies: allergies ?? [], diets: [] } });
  await new Promise((res) => setTimeout(res, (meds?.length ?? 0) ? 20000 : 500)); // label reading happens in the background
} else if (profileName === "demo") {
  await client.mutation(api.profile.save, { deviceId, profile: { medications: [{ name: "simvastatin" }], conditions: [{ name: "High blood pressure" }], allergies: ["tree_nuts"], diets: [] } });
  await client.mutation(api.rules.addCustom, { deviceId, tag: "sodium", level: "limit" });
  // Medication rules are read from the FDA label in the background; wait for them (up to a minute).
  for (let i = 0; i < 60; i++) {
    const r = await client.query(api.rules.list, { deviceId });
    if (r.some((x) => x.from.type === "medication")) break;
    await new Promise((res) => setTimeout(res, 1000));
  }
}
const rules = await client.query(api.rules.list, { deviceId });
console.log(`rules: ${rules.map((r) => `${r.level} ${r.tag} (${r.from.label})`).join(", ") || "(none)"}\n`);

const t0 = Date.now();
let storageId;
if (file) {
  const uploadUrl = await client.mutation(api.scans.generateUploadUrl, {});
  const up = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.endsWith(".png") ? "image/png" : "image/jpeg" }, body: readFileSync(file) });
  ({ storageId } = await up.json());
}
const scanId = await client.mutation(api.scans.start, { deviceId, ...(storageId ? { imageId: storageId } : {}), ...(barcode ? { barcode } : {}) });

let last = "";
let sawProvisional = false;
let scan;
for (;;) {
  scan = await client.query(api.scans.get, { scanId });
  if (scan.provisional && !sawProvisional) {
    sawProvisional = true;
    const fits = Object.values(scan.verdicts).map((v) => v.fit);
    console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] provisional verdicts (${fits.filter((f) => f === "not_fit").length} blocked, ${fits.filter((f) => f === "cant_tell").length} to ask, ${fits.filter((f) => f === "good" || f === "okay").length} clear so far)`);
  }
  if (scan.status !== last) {
    console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${scan.status}${scan.items.length ? ` (${scan.items.length} items)` : ""}`);
    last = scan.status;
  }
  if (scan.status === "done" || scan.status === "failed") break;
  await new Promise((r) => setTimeout(r, 200));
}
if (scan.error) console.log(`\nERROR: ${scan.error}`);
const byId = Object.fromEntries(scan.items.map((i) => [i.id, i]));
console.log(`\n${scan.summary ?? ""}\n`);
let section = "";
for (const r of scan.ranking) {
  if (r.section !== section) console.log(`\n== ${(section = r.section)} ==`);
  const it = byId[r.itemId];
  console.log(`  ${it.name}: ${r.line}${r.modification ? `  [${r.modification}]` : ""}`);
  for (const f of scan.verdicts[r.itemId].findings) console.log(`      ${f.outcome}${f.unsourced ? " (unsourced)" : ""}: ${f.because}`);
}
console.log("\n== questions ==");
for (const q of scan.questions) console.log(`  ${q.text}`);
if (rest.includes("--json")) console.log(JSON.stringify(scan, null, 2));
console.log(`\nscanId ${scanId}`);
