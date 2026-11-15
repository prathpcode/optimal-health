// See what a hosted, pretrained detector finds on photos of packaged products, before building the shelf view on it.
//   node bench/compareDetectors.mjs <folder of .jpg photos> [--out <folder>] [--only <name>]
// Each photo goes to SAM 3 on Roboflow's hosted API with a few ways of asking ("product", a longer phrase, a set
// of package shapes) at two confidence levels. It prints how many things were boxed and how long each call took,
// and writes compare.html (every photo with its boxes drawn on, to judge by eye) and results.json beside it.
// The service gets the photo and nothing else. Needs ROBOFLOW_API_KEY in the environment or in .env.local.
// Time is measured two ways: the whole round trip from here, and what the service says it spent.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const flag = (name, dflt) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : dflt);
const dir = args.find((a, i) => !a.startsWith("--") && !["--out", "--only"].includes(args[i - 1]));
if (!dir) throw new Error("usage: node bench/compareDetectors.mjs <folder of .jpg photos> [--out <folder>] [--only <name>]");
const out = resolve(flag("out", join(dir, "..", "out")));
const only = flag("only", null);

let fileEnv = {};
try {
  fileEnv = Object.fromEntries(
    readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
  );
} catch {
  // No .env.local: the key has to be in the environment.
}
const key = process.env.ROBOFLOW_API_KEY || fileEnv.ROBOFLOW_API_KEY;
if (!key) {
  console.error("No ROBOFLOW_API_KEY. Add ROBOFLOW_API_KEY=... to .env.local (git-ignored) or export it, then run again.");
  process.exit(1);
}

const SHAPES = ["box", "bottle", "can", "jar", "bag", "carton", "pouch", "tub"];
/** The ways of asking that are compared. `nms` drops a box that mostly covers one already found under another word. */
const ASKS = [
  { name: "product @0.5", prompts: ["product"], thresh: 0.5 },
  { name: "product @0.3", prompts: ["product"], thresh: 0.3 },
  { name: "packaged food product @0.5", prompts: ["packaged food product"], thresh: 0.5 },
  { name: "packaged food product @0.3", prompts: ["packaged food product"], thresh: 0.3 },
  { name: "shapes @0.5", prompts: SHAPES, thresh: 0.5, nms: 0.6 },
  { name: "shapes @0.3", prompts: SHAPES, thresh: 0.3, nms: 0.6 },
].filter((a) => !only || a.name.startsWith(only));

/** Width and height of a JPEG, from its frame header. */
function jpegSize(buf) {
  for (let i = 2; i < buf.length - 9; ) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error("not a JPEG");
}

async function ask(base64, size, { prompts, thresh, nms }) {
  const started = Date.now();
  const res = await fetch("https://serverless.roboflow.com/sam3/concept_segment", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ image: { type: "base64", value: base64 }, prompts: prompts.map((text) => ({ type: "text", text })), output_prob_thresh: thresh, format: "polygon", ...(nms ? { nms_iou_threshold: nms } : {}) }),
    signal: AbortSignal.timeout(60_000),
  });
  const ms = Date.now() - started;
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const boxes = [];
  for (const r of data.prompt_results ?? []) {
    for (const p of r.predictions ?? []) {
      // One instance is one or more outlines, each a list of [x, y] in pixels; its box is what holds them all.
      const pts = (Array.isArray(p.masks) ? p.masks : []).flat().filter((pt) => Array.isArray(pt) && pt.length >= 2);
      if (!pts.length) continue;
      const xs = pts.map((pt) => pt[0]), ys = pts.map((pt) => pt[1]);
      boxes.push({ left: Math.min(...xs) / size.width, top: Math.min(...ys) / size.height, right: Math.max(...xs) / size.width, bottom: Math.max(...ys) / size.height, score: p.confidence, label: r.echo?.text ?? "" });
    }
  }
  return { boxes, ms, serverMs: Math.round((data.time ?? 0) * 1000) };
}

const photos = readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f)).sort();
if (!photos.length) throw new Error(`no .jpg photos in ${dir}`);
mkdirSync(out, { recursive: true });
const results = [];
for (const file of photos) {
  const buf = readFileSync(join(dir, file));
  const size = jpegSize(buf);
  const row = { file, ...size, asks: {} };
  for (const a of ASKS) {
    try {
      row.asks[a.name] = await ask(buf.toString("base64"), size, a);
      console.log(`${file}  ${a.name}: ${row.asks[a.name].boxes.length} boxes, ${row.asks[a.name].ms} ms round trip, ${row.asks[a.name].serverMs} ms at the service`);
    } catch (e) {
      row.asks[a.name] = { error: String(e.message ?? e), boxes: [], ms: 0, serverMs: 0 };
      console.log(`${file}  ${a.name}: FAILED ${row.asks[a.name].error}`);
    }
  }
  results.push(row);
}
writeFileSync(join(out, "results.json"), JSON.stringify(results, null, 2));

const COLOURS = { box: "#ff3b30", bottle: "#34c759", can: "#0a84ff", jar: "#ff9f0a", bag: "#bf5af2", carton: "#64d2ff", pouch: "#ffd60a", tub: "#ff375f" };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const cell = (row, name) => {
  const r = row.asks[name];
  const marks = r.boxes.map((b) => `<rect x="${(b.left * row.width).toFixed(1)}" y="${(b.top * row.height).toFixed(1)}" width="${((b.right - b.left) * row.width).toFixed(1)}" height="${((b.bottom - b.top) * row.height).toFixed(1)}" fill="none" stroke="${COLOURS[b.label] ?? "#00e5ff"}" stroke-width="${Math.max(2, row.width / 400)}"><title>${esc(b.label)} ${b.score?.toFixed(2)}</title></rect>`).join("");
  return `<figure><svg viewBox="0 0 ${row.width} ${row.height}"><image href="${pathToFileURL(resolve(dir, row.file)).href}" width="${row.width}" height="${row.height}"/>${marks}</svg><figcaption><b>${esc(name)}</b>: ${r.error ? `failed: ${esc(r.error)}` : `${r.boxes.length} boxes, ${r.ms} ms (${r.serverMs} ms at the service)`}</figcaption></figure>`;
};
const html = `<!doctype html><meta charset="utf-8"><title>Detector comparison</title>
<style>body{font:14px system-ui;margin:16px;background:#111;color:#eee}h2{margin:28px 0 8px}.row{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:12px}figure{margin:0}svg{width:100%;height:auto;display:block;background:#000}figcaption{padding:4px 0;color:#bbb}</style>
<h1>SAM 3 on packaged products</h1><p>Each photo, each way of asking. Hover a box for its word and score.</p>
${results.map((row) => `<h2>${esc(row.file)}</h2><div class="row">${ASKS.map((a) => cell(row, a.name)).join("")}</div>`).join("\n")}`;
writeFileSync(join(out, "compare.html"), html);

console.log("\nBoxes found (median round trip in ms per way of asking)");
for (const a of ASKS) {
  const times = results.map((r) => r.asks[a.name].ms).filter(Boolean).sort((x, y) => x - y);
  console.log(`  ${a.name.padEnd(32)} ${results.map((r) => String(r.asks[a.name].boxes.length).padStart(4)).join("")}   median ${times[Math.floor(times.length / 2)] ?? "-"} ms`);
}
console.log(`  photos, in order: ${photos.map((p) => basename(p)).join(", ")}`);
console.log(`\nOpen ${join(out, "compare.html")}`);
