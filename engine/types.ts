// The contract between the app and the backend. Change only by agreement:
// one pull request that updates this file and fixtures/ together.

export type TagId = string; // must exist in data/tags.json
export type Sureness = "certain" | "likely" | "unsure";
export type Origin = "label" | "database" | "restaurant" | "menu_text" | "inferred" | "user";

export type ItemTag = {
  tag: TagId;
  sureness: Sureness;
  origin: Origin;
  /** The words on the menu or label this tag came from. No evidence, no tag. */
  evidence?: string;
  /** Probability from the judge, when it gave one. */
  p?: number;
};

export type Nutrients = {
  per: "serving" | "100g";
  sodiumMg?: number;
  potassiumMg?: number;
  /** Total sugars. */
  sugarG?: number;
  /** Added sugars, when the label or database gives them separately. The FDA Daily Value is for these. */
  addedSugarG?: number;
  satFatG?: number;
  carbsG?: number;
  proteinG?: number;
  fiberG?: number;
  kcal?: number;
};

export type Box = { top: number; left: number; bottom: number; right: number }; // fractions of the photo
/** A point on the photo, as fractions of its width and height. */
export type Point = { x: number; y: number };
/**
 * The four corners of a line of text, in reading order from its top-left: top-left, top-right, bottom-right,
 * bottom-left. Unlike a Box it follows the text when the photo was taken at an angle.
 */
export type Quad = Point[];

/** One recognised line of text on the photo: its upright extent, and its corners when they are known. */
export type TextOutline = { box: Box; quad?: Quad };

export type Item = {
  id: string;
  kind: "dish" | "product" | "supplement" | "otc";
  name: string;
  description?: string;
  ingredients: { name: string; origin: Origin; evidence?: string }[];
  tags: ItemTag[];
  nutrients?: Nutrients;
  /** Rough levels when no numbers exist (menu dishes). Keys are nutrient tag ids. */
  levels?: Record<string, "low" | "medium" | "high">;
  position?: Box[];
  /** The same lines as `position`, as tilted outlines. Present when text recognition gave the lines' corners. */
  quads?: Quad[];
  /** True when the source could not be read in full (part of a label was blurry or cut off), so "nothing found" proves nothing. */
  incomplete?: boolean;
};

export type RuleLevel = "never" | "avoid" | "limit" | "keep_steady";

export type Rule = {
  id: string;
  level: RuleLevel;
  tag: TagId;
  budget?: { nutrient: string; amount: number; unit: string; per: "day" };
  reason: string;
  source: { title: string; url: string; quote?: string };
  from: { type: "allergy" | "medication" | "condition" | "diet" | "user"; label: string };
  /**
   * How far the rule can be trusted. "library": reviewed by a clinician, or the user's own entry.
   * "sourced": quoted from a public health source and the quote machine-checked against the page; not yet reviewed.
   * "from_label": quoted from the drug's FDA label and the quote machine-checked; not yet reviewed.
   * "unverified": none of the above.
   */
  status: "library" | "sourced" | "from_label" | "unverified";
  enabled: boolean;
};

/** One per item per Never/Avoid rule. Produced by the pipeline, merged by the evaluator. */
export type HardCheck = {
  itemId: string;
  ruleId: string;
  /**
   * What code found in the item's own words. "match": they name the tagged thing (walnuts).
   * "hides_in": they name something that commonly contains it (pesto). "no_match": neither.
   */
  code: "match" | "hides_in" | "no_match";
  /** null = the judge had no opinion (not built, no key, call failed). */
  judgeP: number | null;
  /** Reader's focused second pass. null = not run. */
  reader: "yes" | "maybe" | "no" | null;
  answer?: { value: "yes" | "no"; by: "this_user" | "another_user"; at: string };
};

export type Finding = {
  /** Absent for second-opinion notes and for findings that come from the product's own label (see `source`). */
  ruleId?: string;
  outcome: "blocked" | "ask" | "note" | "confirm";
  /** Short and factual; the explanation model expands it. */
  because: string;
  /** For "ask" and "confirm". */
  question?: string;
  /** True for second-opinion notes; these are always outcome "note". */
  unsourced?: boolean;
  /**
   * For findings that come from the scanned product's own label rather than from one of the person's rules
   * (an OTC "ask a doctor before use if..." line, or an ingredient they already take): the label's words.
   */
  source?: { title: string; quote: string };
  /** The profile item such a finding is about ("apixaban", "high blood pressure"). */
  about?: string;
};

export type Fit = "good" | "okay" | "not_fit" | "cant_tell";

export type Verdict = { fit: Fit; score?: number; findings: Finding[] };

// ---- Profile ----

/** Where reading a medication's FDA label has got to. */
export type MedicationStatus = {
  name: string;
  /** pending: being read. rules: read, produced rules. no_rules: read, nothing about food or supplements.
   *  not_recognised: the name did not match a medicine. no_label: no FDA label found. failed: reading failed; try saving again. */
  state: "pending" | "rules" | "no_rules" | "not_recognised" | "no_label" | "failed";
};

export type Profile = {
  medications: { name: string; rxcui?: string }[];
  conditions: { name: string; key?: string }[];
  allergies: TagId[];
  diets: string[];
};

// ---- Scan record: the only thing the app reads to draw a result ----

export type ScanStatus = "reading" | "judging" | "ranking" | "explaining" | "done" | "failed";

export type RankedItem = {
  itemId: string;
  section: "best" | "okay" | "not_fit" | "cant_tell";
  /** One-line reason shown in the list. */
  line: string;
  /** Suggested change, e.g. "ask for the sauce on the side". */
  modification?: string;
};

export type ScanQuestion = {
  id: string;
  itemId: string;
  ruleId: string;
  text: string;
  answer?: "yes" | "no" | "skipped";
};

export type ScanRecord = {
  status: ScanStatus;
  kind: "menu" | "product" | "label" | "unknown";
  imageId: string;
  /** Empty until the reader finishes. */
  items: Item[];
  checks: HardCheck[];
  /** Keyed by item id. Filled during "judging". */
  verdicts: Record<string, Verdict>;
  /** Ordered best first. Filled during "ranking". */
  ranking: RankedItem[];
  questions: ScanQuestion[];
  /** Overall summary, then per-item explanations keyed by item id. Filled during "explaining". */
  summary?: string;
  explanations: Record<string, string>;
  /** True when no profile exists and the answer is generic. */
  generic: boolean;
  /**
   * True while the verdicts shown are the fast first pass (the judge's quick read of each dish), before the careful
   * check has confirmed or corrected them. Show them as "checking..." and do not offer questions yet.
   */
  provisional?: boolean;
  /** The restaurant's name as printed on the menu or as the user corrected it. */
  restaurantName?: string;
  restaurantId?: string;
  /**
   * Where every line of text is on the photo, present from about a second into a scan until the dishes get positions
   * of their own (`Item.position`). Lets the app show the menu being found before anything has a name. Absent when
   * text recognition is not configured.
   */
  textBoxes?: TextOutline[];
  /**
   * Lines of the photo that already look like trouble for one of the person's hard rules, found from the recognised
   * text a couple of seconds into a scan, before the dishes have been read. A first signal only: shown as "checking",
   * and gone once the dishes have verdicts of their own. Absent when text recognition is not configured.
   */
  earlyHints?: (TextOutline & { fit: "not_fit" | "cant_tell" })[];
  /** Something the user should know about this result, e.g. that their medication rules were still being read. */
  notice?: string;
  error?: string;
};

/** evaluate(item, rules, checks) -> Verdict lives in engine/evaluate.ts */
