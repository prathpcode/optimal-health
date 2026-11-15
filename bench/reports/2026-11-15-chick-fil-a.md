# Allergen benchmark: Chick-fil-A

- Run: 2026-11-15T00:45Z, 96 dishes sampled from 276 (seed 1), 48 s.
- Truth: https://www.chick-fil-a.com/nutrition-allergens (fetched 2026-11-14). Allergen declarations published by the chain, read from the data embedded in its nutrition and allergens page. Item names only; the page gives no descriptions. Size variants of the same item are collapsed.
- Judge (Jev): off (no key set); the 'full' and 'no_judge' columns are therefore identical.
- Each allergen is tested as a Never rule. "Caught" = blocked or turned into a question. "Missed" = contains it, and we raised nothing.

## Everything on

| Allergen | Contain it | Caught | of which blocked | Missed | Do not contain it | Flagged anyway |
| --- | --- | --- | --- | --- | --- | --- |
| dairy | 69 | 100.0% | 56 | 0 | 27 | 10 (37.0%) |
| egg | 48 | 100.0% | 28 | 0 | 48 | 24 (50.0%) |
| soy | 37 | 100.0% | 18 | 0 | 59 | 39 (66.1%) |
| wheat | 48 | 100.0% | 33 | 0 | 48 | 18 (37.5%) |
| sesame | 7 | 100.0% | 1 | 0 | 89 | 28 (31.5%) |
| tree_nuts | 2 | 100.0% | 1 | 0 | 94 | 9 (9.6%) |
| peanuts | 0 | n/a | 0 | 0 | 96 | 34 (35.4%) |
| fish | 0 | n/a | 0 | 0 | 96 | 0 (0.0%) |
| **all** | 211 | **100.0%** |  | **0** | 557 | 162 (29.1%) |

Missed: none

## Code matching and first-pass tags only

| Allergen | Contain it | Caught | of which blocked | Missed | Do not contain it | Flagged anyway |
| --- | --- | --- | --- | --- | --- | --- |
| dairy | 69 | 79.7% | 26 | 14 | 27 | 6 (22.2%) |
| egg | 48 | 79.2% | 18 | 10 | 48 | 10 (20.8%) |
| soy | 37 | 35.1% | 0 | 24 | 59 | 13 (22.0%) |
| wheat | 48 | 89.6% | 27 | 5 | 48 | 8 (16.7%) |
| sesame | 7 | 14.3% | 0 | 6 | 89 | 3 (3.4%) |
| tree_nuts | 2 | 50.0% | 0 | 1 | 94 | 3 (3.2%) |
| peanuts | 0 | n/a | 0 | 0 | 96 | 2 (2.1%) |
| fish | 0 | n/a | 0 | 0 | 96 | 0 (0.0%) |
| **all** | 211 | **71.6%** |  | **60** | 557 | 45 (8.1%) |

Missed: Side Salad (dairy); Spicy Cool Wrap Tray (dairy); Chick-fil-ANuggets Tray (dairy); Frosted Coke (dairy); Frosted Lemonade w/ Diet Lemonade (dairy); Bowl of Chicken Noodle Soup (dairy); Frosted Coca-Cola Cherry (dairy); Frosted Diet Coke (dairy); Chick-fil-A Filet (dairy); Chick-fil-A Chick-n-Minis (dairy); Frosted Hi-C Fruit Punch (dairy); Chicken Noodle Soup (dairy); Frosted Coffee (dairy); Hash Brown Scramble Burrito (dairy); Side Salad (egg); Spicy Cool Wrap Tray (egg); Southwest Veggie Wrap Tray (egg); Chick-fil-ANuggets Tray (egg); Spicy Chicken Biscuit (egg); Mac & Cheese Kid’s Meal (egg); Spicy Southwest Salad w/ Grilled Filet (Cold) (egg); Spicy Southwest Salad w/ Grilled Nuggets (egg); Spicy Southwest Salad w/ Spicy Grilled Filet (Cold) (egg); Spicy Southwest Salad w/ Grilled Filet (Warm) (egg); Hash Brown Scramble Bowl w/ Spicy Chicken - no hash browns (soy); Sweet & Spicy Sriracha Sauce (soy); Hash Brown Scramble Burrito w/ Grilled Filet (soy); Spicy Cool Wrap Tray (soy); Southwest Veggie Wrap Tray (soy); Hash Brown Scramble Burrito w/ Spicy Chicken - no hash browns (soy); Chicken, Egg & Cheese Muffin (soy); Spicy Chicken Biscuit (soy); Bowl of Chicken Noodle Soup (soy); S’mores Frosted Coffee (soy); Spicy Deluxe Sandwich w/ Colby Jack (soy); Hash Brown Scramble Burrito w/  Sausage (soy); Mac & Cheese Kid’s Meal (soy); Hash Brown Scramble Bowl w/ Bacon - no hash browns (soy); Hash Brown Scramble Bowl (soy); Spicy Southwest Salad (soy); Hash Brown Scramble Burrito w/ Sausage - no hash browns (soy); Saltines (soy); Chicken Noodle Soup (soy); Spicy Southwest Salad w/ Spicy Grilled Filet (Cold) (soy); Egg White Grill (soy); Peppermint Chip Frosted Coffee (soy); Hash Brown Scramble Burrito w/ Nuggets (soy); Hash Brown Scramble Burrito (soy); Hash Brown Scramble Bowl w/ Spicy Chicken - no hash browns (wheat); Sweet & Spicy Sriracha Sauce (wheat); Side Salad (wheat); Chick-fil-ANuggets Tray (wheat); Hash Brown Scramble Bowl (wheat); White Bun (Unbuttered) (sesame); Spicy Cool Wrap Tray (sesame); Southwest Veggie Wrap Tray (sesame); Spicy Deluxe Sandwich w/ Colby Jack (sesame); Chick-fil-A Deluxe Sandwich w/ Pepper Jack (sesame); Spicy Deluxe Sandwich w/ American (sesame); Kale Crunch Side (tree_nuts)

## Read this with care

- One chain, fast food, names only. A menu with descriptions gives the pipeline more to work with; an unfamiliar independent restaurant gives it less.
- The reader may already know this chain's menu, which flatters the score.
- Allergens only. This says nothing about drug-food rules or nutrient limits.
- "Flagged anyway" includes cases where caution is arguably right (shared fryers, peanut oil) but the chain does not declare the allergen.
