# Allergen benchmark: Chick-fil-A

- Run: 2026-11-15T04:35Z, 96 dishes sampled from 276 (seed 1), 48 s.
- Truth: https://www.chick-fil-a.com/nutrition-allergens (fetched 2026-11-14). Allergen declarations published by the chain, read from the data embedded in its nutrition and allergens page. Item names only; the page gives no descriptions. Size variants of the same item are collapsed.
- Judge (Jev): on.
- Each allergen is tested as a Never rule. "Caught" = blocked or turned into a question. "Missed" = contains it, and we raised nothing.

## Everything on

| Allergen | Contain it | Caught | of which blocked | Missed | Do not contain it | Flagged anyway |
| --- | --- | --- | --- | --- | --- | --- |
| dairy | 69 | 100.0% | 46 | 0 | 27 | 8 (29.6%) |
| egg | 48 | 100.0% | 21 | 0 | 48 | 24 (50.0%) |
| soy | 37 | 100.0% | 0 | 0 | 59 | 38 (64.4%) |
| wheat | 48 | 100.0% | 34 | 0 | 48 | 17 (35.4%) |
| sesame | 7 | 100.0% | 1 | 0 | 89 | 30 (33.7%) |
| tree_nuts | 2 | 100.0% | 1 | 0 | 94 | 9 (9.6%) |
| peanuts | 0 | n/a | 0 | 0 | 96 | 30 (31.3%) |
| fish | 0 | n/a | 0 | 0 | 96 | 8 (8.3%) |
| **all** | 211 | **100.0%** |  | **0** | 557 | 164 (29.4%) |

Missed: none

## Without the judge

| Allergen | Contain it | Caught | of which blocked | Missed | Do not contain it | Flagged anyway |
| --- | --- | --- | --- | --- | --- | --- |
| dairy | 69 | 100.0% | 57 | 0 | 27 | 8 (29.6%) |
| egg | 48 | 100.0% | 28 | 0 | 48 | 24 (50.0%) |
| soy | 37 | 100.0% | 19 | 0 | 59 | 38 (64.4%) |
| wheat | 48 | 100.0% | 34 | 0 | 48 | 15 (31.3%) |
| sesame | 7 | 100.0% | 1 | 0 | 89 | 24 (27.0%) |
| tree_nuts | 2 | 100.0% | 1 | 0 | 94 | 9 (9.6%) |
| peanuts | 0 | n/a | 0 | 0 | 96 | 29 (30.2%) |
| fish | 0 | n/a | 0 | 0 | 96 | 1 (1.0%) |
| **all** | 211 | **100.0%** |  | **0** | 557 | 148 (26.6%) |

Missed: none

## Without the per-rule second pass

| Allergen | Contain it | Caught | of which blocked | Missed | Do not contain it | Flagged anyway |
| --- | --- | --- | --- | --- | --- | --- |
| dairy | 69 | 89.9% | 34 | 7 | 27 | 7 (25.9%) |
| egg | 48 | 97.9% | 20 | 1 | 48 | 9 (18.8%) |
| soy | 37 | 54.1% | 0 | 17 | 59 | 20 (33.9%) |
| wheat | 48 | 97.9% | 29 | 1 | 48 | 14 (29.2%) |
| sesame | 7 | 85.7% | 1 | 1 | 89 | 22 (24.7%) |
| tree_nuts | 2 | 100.0% | 0 | 0 | 94 | 2 (2.1%) |
| peanuts | 0 | n/a | 0 | 0 | 96 | 4 (4.2%) |
| fish | 0 | n/a | 0 | 0 | 96 | 8 (8.3%) |
| **all** | 211 | **87.2%** |  | **27** | 557 | 86 (15.4%) |

Missed: Frosted Lemonade (dairy); Frosted Lemonade w/ Diet Lemonade (dairy); Bowl of Chicken Noodle Soup (dairy); Frosted Caffeine Free Diet Coke (dairy); Frosted Diet Coke (dairy); Frosted Hi-C Fruit Punch (dairy); Chicken Noodle Soup (dairy); Southwest Veggie Wrap Tray (egg); Buttery Biscuit (soy); Cookie & Brownie Tray (soy); Hash Brown Scramble Burrito w/ Grilled Filet (soy); Hash Brown Scramble Burrito w/ Spicy Chicken - no hash browns (soy); Chicken, Egg & Cheese Muffin (soy); S’mores Frosted Coffee (soy); Hash Brown Scramble Burrito w/  Sausage (soy); Mac & Cheese Kid’s Meal (soy); Bacon, Egg & Cheese Muffin (soy); Hash Brown Scramble Bowl w/ Bacon - no hash browns (soy); Hash Brown Scramble Bowl (soy); Breakfast Breads (soy); Chocolate Fudge Brownie (soy); Hash Brown Scramble Burrito w/ Sausage - no hash browns (soy); Egg White Grill (soy); Peppermint Chip Frosted Coffee (soy); Hash Brown Scramble Burrito (soy); Sweet & Spicy Sriracha Sauce (wheat); Southwest Veggie Wrap Tray (sesame)

## Code matching and first-pass tags only

| Allergen | Contain it | Caught | of which blocked | Missed | Do not contain it | Flagged anyway |
| --- | --- | --- | --- | --- | --- | --- |
| dairy | 69 | 85.5% | 32 | 10 | 27 | 7 (25.9%) |
| egg | 48 | 83.3% | 20 | 8 | 48 | 9 (18.8%) |
| soy | 37 | 16.2% | 0 | 31 | 59 | 9 (15.3%) |
| wheat | 48 | 89.6% | 27 | 5 | 48 | 8 (16.7%) |
| sesame | 7 | 0.0% | 0 | 7 | 89 | 1 (1.1%) |
| tree_nuts | 2 | 100.0% | 0 | 0 | 94 | 2 (2.1%) |
| peanuts | 0 | n/a | 0 | 0 | 96 | 3 (3.1%) |
| fish | 0 | n/a | 0 | 0 | 96 | 0 (0.0%) |
| **all** | 211 | **71.1%** |  | **61** | 557 | 39 (7.0%) |

Missed: Frosted Lemonade (dairy); Chick-fil-ANuggets Tray (dairy); Frosted Lemonade w/ Diet Lemonade (dairy); Bowl of Chicken Noodle Soup (dairy); Frosted Caffeine Free Diet Coke (dairy); Frosted Diet Coke (dairy); Chick-fil-A Filet (dairy); Frosted Hi-C Fruit Punch (dairy); Chicken Noodle Soup (dairy); Egg White Grill (dairy); Spicy Cool Wrap Tray (egg); Southwest Veggie Wrap Tray (egg); Chick-fil-ANuggets Tray (egg); Spicy Chicken Biscuit (egg); Spicy Southwest Salad w/ Grilled Filet (Cold) (egg); Chick-fil-A Filet (egg); Spicy Southwest Salad w/ Spicy Grilled Filet (Cold) (egg); Spicy Southwest Salad w/ Grilled Filet (Warm) (egg); Buttery Biscuit (soy); Cookie & Brownie Tray (soy); Hash Brown Scramble Bowl w/ Spicy Chicken - no hash browns (soy); Sweet & Spicy Sriracha Sauce (soy); Hash Brown Scramble Burrito w/ Grilled Filet (soy); Spicy Cool Wrap Tray (soy); Southwest Veggie Wrap Tray (soy); Hash Brown Scramble Burrito w/ Spicy Chicken - no hash browns (soy); Chicken, Egg & Cheese Muffin (soy); Spicy Chicken Biscuit (soy); Bowl of Chicken Noodle Soup (soy); S’mores Frosted Coffee (soy); Spicy Deluxe Sandwich w/ Colby Jack (soy); Hash Brown Scramble Burrito w/  Sausage (soy); Mac & Cheese Kid’s Meal (soy); Bacon, Egg & Cheese Muffin (soy); Hash Brown Scramble Bowl w/ Bacon - no hash browns (soy); Hash Brown Scramble Bowl (soy); Chicken & Waffles Breakfast Sandwich w/ Chick-fil-A Filet (soy); Chick-fil-A Chicken Biscuit (soy); Breakfast Breads (soy); Chocolate Fudge Brownie (soy); Spicy Southwest Salad (soy); Hash Brown Scramble Burrito w/ Sausage - no hash browns (soy); Chicken Noodle Soup (soy); Spicy Southwest Salad w/ Spicy Grilled Filet (Cold) (soy); Egg White Grill (soy); Spicy Deluxe Sandwich w/ American (soy); Peppermint Chip Frosted Coffee (soy); Hash Brown Scramble Burrito w/ Nuggets (soy); Hash Brown Scramble Burrito (soy); Hash Brown Scramble Bowl w/ Spicy Chicken - no hash browns (wheat); Sweet & Spicy Sriracha Sauce (wheat); Chick-fil-ANuggets Tray (wheat); Hash Brown Scramble Bowl (wheat); Egg White Grill (wheat); White Bun (Unbuttered) (sesame); Spicy Cool Wrap Tray (sesame); Southwest Veggie Wrap Tray (sesame); Spicy Deluxe Sandwich w/ Colby Jack (sesame); Chick-fil-A Deluxe Sandwich w/ Pepper Jack (sesame); Chick-fil-A Chicken Sandwich (sesame); Spicy Deluxe Sandwich w/ American (sesame)

## Read this with care

- One chain, fast food, names only. A menu with descriptions gives the pipeline more to work with; an unfamiliar independent restaurant gives it less.
- The reader may already know this chain's menu, which flatters the score.
- Allergens only. This says nothing about drug-food rules or nutrient limits.
- "Flagged anyway" includes cases where caution is arguably right (shared fryers, peanut oil) but the chain does not declare the allergen.
