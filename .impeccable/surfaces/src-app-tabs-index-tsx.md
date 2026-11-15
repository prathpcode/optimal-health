---
version: 1
slug: "src-app-tabs-index-tsx"
primary_target: "src/app/(tabs)/index.tsx"
related_targets: ["src/app/result/[id].tsx","src/app/(tabs)/me.tsx","src/app/(tabs)/together.tsx"]
---

# Fit app screens (Home, Result, Me, Together)

Scope: full redesign of the app's working screens. Mode: Operate. Platform: iOS-first (native tabs, sheets, SF Symbols, system font). Build path: code-led.
Job: at a restaurant table or grocery aisle, scan, see in seconds which dishes fit, and know what to ask the server. Problem being fixed: today's UI is confusing (dashboard of counts on Home, scan hidden behind a corner "+", three verdict vocabularies on Result, verdict colours reused for rule levels).

## Direction contract

THESIS: Every scan reads like an order written up at your table: one ruled line per dish, verdict on the line, and a tear-off stub of questions you show your server. Refuses the food-scanner default of white cards, score rings and dashboards of numbers.

OWN-WORLD: Guest-check green stock as the ground, deep check-green rules and headers, near-black ink, carbon violet for figures (check numbers, counts, times). Hairline ruled rows instead of shadowed cards; a perforated edge marks anything you tear off or hand over. Verdict colours stay only on verdicts. Line form carries verdict too: ruled line for Good fit, dashed for Can't tell, carbon strike through the dish name for Not a fit, double rule for Okay, with notes.

STORY: The person opens Fit and sees one thing to do: scan. On a result they read the check top to bottom (fits first) using the four verdict words only, then tap "Show your server" to turn the questions into a large stub to show the server.

FIRST VIEWPORT: Home: large title "Fit", one line "Checking 12 rules for you" (taps to Me), a full-width "Scan a menu" primary button with camera and photo actions, then "Recent checks": ruled rows with a violet check number, title, time and verdict tally. Together appears as one ruled row, not a card.

FORM: The Guest Check, position 3 of 7 on the ordered list. seed:e5d7e4c805ef0cde. Raises: line-form state (emission rail), one dominant area per screen (zoo map), one type size doing most work (acetate manual), destructive actions isolated (console).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
