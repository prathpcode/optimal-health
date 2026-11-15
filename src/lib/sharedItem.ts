import type { Item, Nutrients } from '@engine/types';

/**
 * What a forum post can carry about a dish or product so others in the room can look at it: only facts about the
 * food (name, place, description, ingredients, nutrition). Never the poster's verdict, reasons, rules, questions or
 * anything else from their profile. It travels inside the Whop post as a link, so it lives on Whop with the post.
 */
export type SharedItem = {
  kind: Item['kind'];
  name: string;
  place?: string;
  description?: string;
  /** `guess` marks ingredients inferred from the dish name rather than stated by the menu or label. */
  ingredients: { name: string; guess?: boolean }[];
  nutrients?: Nutrients;
};

const MAX_INGREDIENTS = 30;

export function toSharedItem(item: Item, place?: string): SharedItem {
  const out: SharedItem = {
    kind: item.kind,
    name: item.name.slice(0, 120),
    ingredients: item.ingredients.slice(0, MAX_INGREDIENTS).map((i) => (i.origin === 'inferred' ? { name: i.name, guess: true } : { name: i.name })),
  };
  if (place) out.place = place.slice(0, 120);
  if (item.description) out.description = item.description.slice(0, 400);
  if (item.nutrients) out.nutrients = item.nutrients;
  return out;
}

// base64url over UTF-8, so names with accents survive.
function toB64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(b64: string): string {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
}

export const ITEM_LINK_PREFIX = 'fitscanner://item?d=';

/** The Markdown link line added to a post. Reads as a plain link on Whop. */
export function itemLink(item: SharedItem): string {
  return `[Open in Second Look](${ITEM_LINK_PREFIX}${toB64Url(JSON.stringify(item))})`;
}

const LINK_RE = /\[[^\]]*\]\(fitscanner:\/\/item\?d=([A-Za-z0-9_-]+)\)/;

/** Pull the shared item out of a post's text, if it has one, and return the text without the link. */
export function readItemLink(content: string): { item?: SharedItem; text: string } {
  const m = LINK_RE.exec(content);
  if (!m) return { text: content };
  const text = content.replace(LINK_RE, '').replace(/\n{3,}/g, '\n\n').trim();
  try {
    const raw = JSON.parse(fromB64Url(m[1])) as Partial<SharedItem>;
    if (typeof raw.name !== 'string' || !Array.isArray(raw.ingredients)) return { text };
    return { item: raw as SharedItem, text };
  } catch {
    return { text };
  }
}
