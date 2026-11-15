// Menus and packages often print in capitals ("GRILLED CHICKEN CAESAR"). That is a typographic choice of theirs, not
// part of the name, and repeating it makes the app shout. These two pure helpers tidy a line that is printed in
// capitals and leave anything else exactly as it was read, so a name that was printed in mixed case is never touched.
//
// Only what is shown changes: tags, evidence and rules are matched on normalised text (engine/tagMatch.ts), which
// lowercases anyway, so casing here can never change a verdict.

/** Words kept in capitals even inside a tidied line. */
const KEEP_UPPER = new Set([
  "bbq", "blt", "blat", "byo", "ipa", "pbj", "pb", "msg", "oj", "xo", "xl", "xxl", "gf", "df", "am", "pm",
  "ny", "nyc", "la", "sf", "dc", "us", "usa", "uk", "ii", "iii", "iv",
]);

/** Small words that stay lowercase unless they open or close the line. */
const SMALL = new Set([
  "a", "an", "and", "the", "or", "of", "with", "in", "on", "at", "to", "for", "from", "by", "over", "under",
  "de", "del", "della", "du", "le", "les", "la", "el", "al", "con", "en", "y", "e", "da", "di", "van", "von",
]);

const SHOUTING = (text: string) => /\p{Lu}/u.test(text) && !/\p{Ll}/u.test(text);

const letters = (token: string) => token.replace(/[^\p{L}]/gu, "").toLowerCase();

/** "GRILLED CHICKEN" -> "Grilled Chicken"; "CHEF'S T-BONE" -> "Chef's T-Bone". Apostrophes and hyphens survive. */
function capitalise(token: string): string {
  return token.replace(/\p{L}+(?:['\u2019]\p{L}+)*/gu, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
}

/** One token of a tidied line: left alone if it has a digit or is a word we keep in capitals. */
function tidyToken(token: string, small: boolean): string {
  if (/\d/.test(token)) return token;
  const key = letters(token);
  if (!key) return token;
  if (KEEP_UPPER.has(key)) return token.toUpperCase();
  if (small && SMALL.has(key)) return token.toLowerCase();
  return capitalise(token);
}

/** A name as it should be shown: title case when it was printed in capitals, untouched otherwise. */
export function tidyName(text: string): string {
  if (!SHOUTING(text)) return text;
  const tokens = text.split(/(\s+)/);
  const words = tokens.filter((t) => t.trim()).length;
  let seen = 0;
  return tokens
    .map((token) => {
      if (!token.trim()) return token;
      seen += 1;
      return tidyToken(token, seen > 1 && seen < words);
    })
    .join("");
}

/** A sentence as it should be shown: sentence case when it was printed in capitals, untouched otherwise. */
export function tidySentence(text: string): string {
  if (!SHOUTING(text)) return text;
  const lowered = text
    .split(/(\s+)/)
    .map((token) => {
      if (!token.trim() || /\d/.test(token)) return token;
      return KEEP_UPPER.has(letters(token)) ? token.toUpperCase() : token.toLowerCase();
    })
    .join("");
  // Capitalise the opening letter, and the first letter after each sentence end.
  let start = true;
  return lowered.replace(/\p{L}|[.!?]/gu, (ch) => {
    if (ch === "." || ch === "!" || ch === "?") {
      start = true;
      return ch;
    }
    if (!start) return ch;
    start = false;
    return ch.toUpperCase();
  });
}
