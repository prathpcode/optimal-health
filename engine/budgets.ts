import dailyValues from "../data/dailyValues.json";
import { tagInfo } from "./tags";
import type { Item, Nutrients, Rule } from "./types";

type NutrientField = Exclude<keyof Nutrients, "per">;
const DAILY_VALUES = dailyValues.values as Partial<Record<NutrientField, { amount: number; unit: string }>>;

/**
 * FDA's guide for reading a percentage of a daily amount: 5% or less per serving is low, 20% or more is high.
 * (Source and quote in data/dailyValues.json.)
 */
export const BUDGET_BANDS = { low: dailyValues.bands.low, high: dailyValues.bands.high };

export type BudgetShare = {
  amount: number;
  unit: string;
  share: number;
  per: "serving" | "100g";
  /** "own": the rule's own daily budget. "daily_value": FDA's Daily Value, used when the rule sets no budget. */
  basis: "own" | "daily_value";
  /** True when the only sugar figure is total sugars and it would be compared with the added-sugars Daily Value. */
  totalSugarsAgainstAddedSugarsValue?: boolean;
};

/**
 * How much of a Limit rule's daily amount this item uses. Uses the rule's own budget when it has one, otherwise
 * FDA's Daily Value for that nutrient. null when the item has no number or there is nothing to compare it to.
 */
export function budgetShare(item: Item, rule: Rule): BudgetShare | null {
  if (!item.nutrients) return null;
  const field = (rule.budget?.nutrient || tagInfo(rule.tag)?.nutrient) as NutrientField | undefined;
  if (!field) return null;
  const own = rule.budget && rule.budget.amount > 0 ? { amount: rule.budget.amount, unit: rule.budget.unit } : null;
  // Sugar: the Daily Value is for added sugars, so prefer that figure when the label gives it.
  const added = field === "sugarG" && !own ? item.nutrients.addedSugarG : undefined;
  const usingAdded = typeof added === "number" && Number.isFinite(added) && added >= 0;
  const amount = usingAdded ? (added as number) : item.nutrients[field];
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) return null;
  const ref = own ?? DAILY_VALUES[field];
  if (!ref) return null;
  return {
    amount, unit: ref.unit, share: amount / ref.amount, per: item.nutrients.per, basis: own ? "own" : "daily_value",
    ...(field === "sugarG" && !own && !usingAdded ? { totalSugarsAgainstAddedSugarsValue: true } : {}),
  };
}

export function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}
