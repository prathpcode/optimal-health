// Fetch every source cited in data/ and check that its quote is on the page, word for word.
//   npm run verify:sources
// A quote that cannot be found fails the run: sources are fetched and matched, never trusted from memory.
import { readFileSync } from "node:fs";

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));
const decode = (s) =>
  s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"').replace(/&mdash;/g, "—").replace(/&ndash;/g, "–").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
const pageText = (html) => decode(html.replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "));
// Compare on words only: collapse whitespace, drop space before punctuation, unify curly quotes.
const norm = (s) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim().toLowerCase();

const checks = [];
const conditions = read("data/rules/conditions.json").conditions;
for (const [key, c] of Object.entries(conditions)) {
  for (const r of c.rules) checks.push({ where: `conditions/${key}/${r.tag}`, url: c.source.url, quote: r.quote });
  if (c.note) checks.push({ where: `conditions/${key}/note`, url: c.source.url, quote: c.note.quote });
}
const dv = read("data/dailyValues.json");
for (const [k, val] of Object.entries(dv.values)) checks.push({ where: `dailyValues/${k}`, url: dv.source.url, quote: val.quote });
checks.push({ where: "dailyValues/bands", url: dv.source.url, quote: dv.bands.quote });

const pages = new Map();
async function page(url) {
  if (!pages.has(url)) {
    pages.set(url, (async () => {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh) source-check" }, redirect: "follow" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return norm(pageText(await res.text()));
    })());
  }
  return pages.get(url);
}

let failed = 0;
for (const c of checks) {
  try {
    const ok = (await page(c.url)).includes(norm(c.quote));
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} ${c.where}${ok ? "" : `\n       quote not found on ${c.url}\n       "${c.quote}"`}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${c.where}\n       could not fetch ${c.url}: ${e.message}`);
  }
}
console.log(`\n${checks.length - failed} of ${checks.length} quotes found on their pages.`);
process.exit(failed ? 1 : 0);
