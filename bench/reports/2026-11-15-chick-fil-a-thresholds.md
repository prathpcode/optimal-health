# Judge bands for Never rules

- From bench/reports/2026-11-15-chick-fil-a-judge.json (96 dishes; 211 dish-and-allergen pairs that really contain the allergen, 557 that do not).
- Chosen on the even-numbered dishes, reported on the odd-numbered ones.
- low: the highest value at which no real case in the tuning half is voted "no". high: the lowest value at which at least 95% of the tuning half's "yes" votes are real.
- The data supports: low 0.01, high 0.84. In use: 0.1 / 0.5.

## Tuning half

| Bands | low / high | Real cases voted "no" | Allergen-free cases voted "no" | Real cases voted "yes" | Allergen-free cases voted "yes" |
| --- | --- | --- | --- | --- | --- |
| in use | 0.1 / 0.5 | 17 of 112 (15.2%) | 233 of 272 (85.7%) | 65 of 112 (58.0%) | 9 of 272 (3.3%) |
| supported | 0.01 / 0.84 | 0 of 112 (0.0%) | 2 of 272 (0.7%) | 57 of 112 (50.9%) | 3 of 272 (1.1%) |

## Held-out half

| Bands | low / high | Real cases voted "no" | Allergen-free cases voted "no" | Real cases voted "yes" | Allergen-free cases voted "yes" |
| --- | --- | --- | --- | --- | --- |
| in use | 0.1 / 0.5 | 14 of 99 (14.1%) | 240 of 285 (84.2%) | 63 of 99 (63.6%) | 10 of 285 (3.5%) |
| supported | 0.01 / 0.84 | 0 of 99 (0.0%) | 0 of 285 (0.0%) | 53 of 99 (53.5%) | 7 of 285 (2.5%) |

## The real cases the judge scored lowest

- 0.02  Frosted Caffeine Free Diet Coke: dairy
- 0.02  Frosted Diet Coke: dairy
- 0.02  Frosted Hi-C Fruit Punch: dairy
- 0.03  Buttery Biscuit: soy
- 0.03  Frosted Lemonade: dairy
- 0.03  Frosted Lemonade w/ Diet Lemonade: dairy
- 0.04  Saltines: soy
- 0.05  Bowl of Chicken Noodle Soup: dairy

## What follows from this

- With the bands in use, the judge votes "no" on 14.1% of the held-out dishes that really contain the allergen. On its own (the fast provisional pass) that shows them as a fit, with only the standing "confirm" reminder, until the careful check lands.
- A "no" band that makes no such mistake is almost empty: at 0.01 it covers 0.0% of the allergen-free cases. The judge's low scores do not separate the two groups, so it cannot serve as a "no" voter. Adopting that band means the provisional pass shows "Can't tell" for nearly every dish it does not block, and, were the judge ever switched into final verdicts, it would turn almost every cleared dish into a question.
- Raising high from 0.5 to 0.84 cuts wrong provisional "Not a fit" calls from 3.5% to 2.5% of allergen-free cases, and moves 10 real cases from "Not a fit" to a question.

## What this does and does not show

- These bands apply to Never rules only. The benchmark tests every allergen as a Never rule, so it says nothing about Avoid rules; those keep their starting bands.
- One fast-food chain, dish names with no descriptions. A menu with descriptions gives the judge more to go on and may support different bands.
- The judge does not feed final verdicts (JUDGE_ENABLED is off), so these bands change only what is shown while a scan is still being checked.
