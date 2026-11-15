// Finding the database record for a package whose front has been read. Shared by the scan camera's shelf view
// (convex/shelf.ts) and by a photo of a single package's front (convex/pipeline.ts).
//
// Nothing here knows or guesses what is in a product: it only decides which record, if any, is the same product.

import { blockSignature, matchProduct, type KnownProduct } from "../engine/shelf";
import { judgeSameProduct } from "./judge";

/** A package front as the photo reader read it. */
export type PackageReading = { index: number; brand: string; name: string; variety: string };

type Candidate = KnownProduct;

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * The database record for a package whose front has been read, or null. The product database's search ranks
 * records by how well they fit the words, so the front is searched as it was read, then without the brand in case
 * the record files it differently; the first search to turn up records that `sameProduct` accepts ends it.
 */
export async function findProduct(reading: PackageReading): Promise<{ matches: Candidate[]; searched: number; offered: number }> {
  let offered = 0;
  const tried = new Set<string>();
  for (const part of [[reading.brand, reading.name, reading.variety], [reading.name, reading.variety], [reading.brand, reading.variety]]) {
    const query = part.filter(Boolean).join(" ").replace(/\s+/g, " ").trim().toLowerCase();
    if (query.length < 3 || tried.has(query)) continue;
    if (tried.size) await pause(1000);
    tried.add(query);
    const url = new URL("https://search.openfoodfacts.org/search");
    for (const [k, val] of Object.entries({ q: query, page_size: "8", fields: "code,product_name,brands" })) url.searchParams.set(k, val);
    try {
      const res = await fetch(url, { headers: { "User-Agent": "second-look/0.1" }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const hits = ((await res.json()) as { hits?: { code?: string; product_name?: string; brands?: string | string[] }[] }).hits ?? [];
      const candidates: Candidate[] = hits
        .filter((p) => p.code && typeof p.product_name === "string" && p.product_name.trim())
        .map((p) => {
          const brand = (Array.isArray(p.brands) ? p.brands[0] : p.brands?.split(",")[0])?.trim();
          return { key: p.code!, name: p.product_name!.trim(), ...(brand ? { brand } : {}) };
        });
      offered += candidates.length;
      const matches = candidates.length ? await sameProduct(reading, candidates) : [];
      if (matches.length) return { matches, searched: tried.size, offered };
    } catch (e) {
      console.error("product search failed", e);
    }
  }
  return { matches: [], searched: tried.size, offered };
}

/**
 * The candidates that are the product whose front was read, best first; empty when none is. The database holds
 * the same product many times over (other sizes, other countries), so several records can all be right, and the
 * caller takes the first that has ingredients to go on.
 *
 * Two independent checks, and a record has to pass both. The judge is asked of each candidate whether it is the
 * same product and the same variety; only candidates it is nearly sure of, and about as sure of as its favourite,
 * are kept. Code then compares the words (engine/shelf.ts matchProduct): a record whose own name is not on the
 * front is dropped whatever the judge thought. Without the judge, the words alone decide, and they refuse when two
 * differently named records fit equally.
 */
async function sameProduct(reading: PackageReading, candidates: Candidate[]): Promise<Candidate[]> {
  const front = [reading.brand, reading.name, reading.variety].filter(Boolean).join(" ");
  const ps = await judgeSameProduct(reading, candidates);
  console.log("shelf candidates", JSON.stringify(candidates.map((c, i) => `${c.brand ?? ""} ${c.name}${ps ? ` p=${ps[i].toFixed(2)}` : ""}`)));
  if (!ps) {
    // One record per distinct name, so that copies of the same product do not look like rivals.
    const distinct = [...new Map(candidates.map((c) => [blockSignature(`${c.brand ?? ""} ${c.name}`), c])).values()];
    const byWords = matchProduct(front, distinct);
    return byWords ? [byWords] : [];
  }
  const best = Math.max(...ps);
  if (best < 0.9) return [];
  return candidates.filter((c, i) => ps[i] >= best - 0.03 && matchProduct(front, [c]));
}
