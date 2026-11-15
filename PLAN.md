# Fit scanner: full plan and team handoff

Version 1, 2026-11-14. This one file is the shared context for everyone building, and for any coding
assistant they use. Read sections 1-4 before writing anything; sections 5-9 are reference; section 10 is the build order.

Working name: "Fit" (placeholder; rename freely).

Context: this started as an entry for the Consumer Mobile Hackathon at the YC office on 2026-11-15 (theme: an app
people open again tomorrow; Capy, Revyl and Convex are required tools). The team intends to build it regardless,
so the standing instruction is: build now, quality first, and use the required tools where they do real work.

---

## 1. What we are building

A phone app for people with health conditions, medications, allergies or dietary restrictions. They point
the camera at a restaurant menu or a grocery item and see how it fits **them**: what is best, what to skip,
why, and what to ask when the app cannot know. Supplements and OTC medication follow on the same engine.

One line: *other scanners score the product; this scores the product for you.*

Why it is not "a chatbot with a camera"
1. A language model only reads and explains. A separate decision model judges, and plain code decides.
2. Accuracy is measured against restaurant menus whose true allergen content is published.
3. The app accumulates data nobody else has: confirmed answers per restaurant, and later each person's own reactions.
4. Every reason carries a source the user can open.

## 2. Rules that never bend

1. The app never says "safe". Verdicts are: **Good fit / Okay, with notes / Not a fit / Can't tell**.
2. Code decides what is blocked. Models may add caution; no model output can remove or soften a hard flag.
3. Absence is not proof. On anything inferred (every menu dish), a Never rule is never silently cleared:
   the result always carries "confirm no X with your server". Only a printed label, a database record or the
   restaurant's own published information can clear it. A user's own "No, I asked" is recorded for that user
   only, with its date, and is always shown as "you confirmed", never as a fact about the dish.
4. Every tag needs evidence (the words it came from). No evidence, no tag.
5. Every rule needs a source, or is visibly marked "unverified". Source URLs and quotes are fetched and
   string-matched against the page; they are never written from memory, by a person or a model. A drafted rule
   stays "unverified" until the clinical lead has reviewed it.
6. The app never tells anyone to take, stop or change a medication. It is a reference tool.
7. Nothing derived is stored as truth: verdicts are recomputed from items + rules.
8. Arithmetic happens in code, never in a model.

## 3. Words we use

| Word | Meaning |
| --- | --- |
| Profile | What the user told us: medications, conditions, allergies, diet |
| Rule | One line of "Your rules", compiled from the profile. Levels: Never, Avoid (hard); Limit, Keep steady (soft) |
| Tag | A label from our fixed list (tree nuts, grapefruit, high sodium...) attached to a food so it can be matched to rules |
| Sureness | How sure a tag is: certain / likely / unsure. Backed by a probability where the judge supplies one |
| Origin | Where a tag came from: label, database, restaurant, menu text, inferred, user |
| Item | Anything scanned, in one common shape: a dish, a product, a supplement, an OTC drug |
| Reader | The step that turns a photo or barcode into Items (language model + lookups) |
| Judge | The decision model (Jev) answering narrow yes/no questions with a probability |
| Evaluator | Plain code that applies rules to an Item and produces a Verdict |
| Finding | One reason inside a verdict: blocked / ask / note / confirm |

## 4. Scope

Build now, in this order (details in section 10)
1. Engine: formats, tag list, starter rule library, evaluator, tests.
2. Menu scan -> ranked result on a real phone.
3. Profile setup and the "Your rules" screen.
4. Grocery scan: barcode and label photo.
5. Follow-up questions on any result.
6. Judge (Jev) and the accuracy benchmark.
7. "Ask your server" answer buttons, remembered per restaurant.
8. Boxes drawn on the menu photo.
9. Supplements and OTC medication.

Later
- "How did that sit?" and the personal response model.
- Health-record import (Apple Health); rules that follow lab values.
- Accounts, sharing a profile with a caregiver, dose timing, recall alerts.

---

## 5. How the app looks and behaves

Tabs: **Scan** (default; opens to the camera) and **Me** (profile, What I take, Your rules, history).

Scan
- One camera, no mode picker. A barcode fires on its own with a haptic tap; otherwise the user presses the
  shutter and the app decides whether it is a menu, a product or a label.
- The result is a card sliding up over the photo. It fills in live: name -> hard flags -> ranking -> explanation.

Result card, same layout everywhere
1. Verdict line.
2. Reasons. Each shows the profile item it relates to ("simvastatin", "tree nut allergy"); tap for the source quote.
3. What to do instead, or what to ask.
4. Follow-up question box.

Menu result
```
Best for you
  Grilled salmon, rice        low sodium - confirm no tree nuts
  Chicken souvlaki plate      ask for sauce on the side
Okay
  Margherita pizza            high sodium
Not a fit
  Pad thai                    peanuts (your allergy)
Ask your server
  "Does the pesto contain pine nuts or walnuts?"   [Yes] [No] [Didn't ask]
```
- Tap a dish for detail, including which ingredients were stated and which inferred.
- The answer buttons update the result at once and are remembered for that restaurant.
- A second photo adds another menu page.
- Later: boxes on the photo, one per dish, coloured by verdict; tap a box for its detail.

Grocery result
- Allergen matches first, in red.
- Then the two or three things driving the verdict, with real numbers ("37% of your daily sodium limit per serving").
- "Compare" scans a second product and shows both side by side.
- Product unknown, or the user has a Never rule: ask for a photo of the ingredient panel.

Supplement / OTC result (later)
- Names the user's own medication in the reason; quotes the FDA label; flags duplicate ingredients against
  "What I take"; offers "Add to What I take" and "Question for my pharmacist".

Setup, under a minute
1. Medications: search as you type; brand names resolve to the drug; name only, no dose. "Scan a bottle" is a secondary button.
2. Conditions: common ones as chips; search for the rest.
3. Allergies and diet: chips.
4. Your rules:
```
NEVER   Tree nuts                   your allergy
AVOID   Grapefruit                  simvastatin - FDA label
LIMIT   Sodium (1,500 mg a day)     high blood pressure - AHA
LIMIT   Potassium salt substitutes  lisinopril - FDA label
[+ Add your own rule]
```
   Tap a row for its source, to switch it off, or to edit it.
   (These four rows are illustrative, not reviewed content.)

Awkward cases
- Blurry or partial photo: say what could not be read; offer a retake. Never guess.
- Empty profile: scanning works; the card says the answer is generic and prompts setup.
- Offline or a model failure: say so plainly; never show a partial result as complete.

---

## 6. How it works

```
menu photo ----+
barcode -------+--> Reader --> Items --> Judge --> Evaluator --> Verdicts --> Ranking + Explanation
label photo ---+                                      ^
                          Profile --> Rule compiler --> Rules
```

### 6.1 Rule compiler (runs at setup and whenever the profile changes)
1. Medication typed -> NLM autocomplete -> drug id -> drug class by lookup table (not model judgment).
2. Conditions, allergies, diet -> keys in our rule library (autocomplete; a Choice question for free text).
3. Library keys -> rules. The library is data in the repo; every rule has a source.
4. Drug not in the library -> fetch its FDA label, a language model extracts food-related rules with quotes,
   code confirms each quote appears in the label -> rule marked "from label".
5. Anything else -> model-written rule marked "unverified".

### 6.2 Menu scan
1. Phone: capture -> upload to backend file storage -> create a scan record. Shrink the photo only as far as
   small print stays legible to the reader (check on real menus). From step 8, on-device text recognition also
   sends the recognised lines with their positions.
2. Reader (vision language model, structured output) gets the image, plus the recognised lines when present
   (`lines` is an optional input, so the app runs without a native module until step 8). It returns
   dishes: name, description, the line numbers they occupy, ingredients (stated or inferred, each with
   evidence), tags with evidence, and rough nutrient levels (low / medium / high; no invented numbers).
3. Hard rules, per dish, three independent checks:
   a. Code: stated ingredients and the "commonly hides in" lists against the user's Never / Avoid tags.
   b. Judge: one request per dish; state = dish text + reader ingredients + the relevant hides-in notes;
      one yes/no question per hard rule; returns a probability.
   c. Reader second pass: one narrow question per hard rule across the menu ("which dishes could contain tree nuts?").
4. Evaluator combines them (table in 6.5).
5. Soft rules -> fit score in code.
6. The language model ranks the unblocked dishes with the rules as context and may suggest modifications.
   Code then checks nothing blocked was recommended.
7. The language model writes the explanation from the evaluator output only.
8. Second opinion: the language model sees the item and the whole profile and may raise a concern no rule covers.
   It appears as a note labelled "noted by the assistant, no cited source" and can never change a hard-rule outcome.
9. Each step writes to the scan record; the screen updates as it lands.

### 6.3 Grocery scan
1. Barcode -> food database. In parallel, or if not found, a label photo -> reader extracts the ingredient
   list, the "Contains:" statement and the nutrition panel.
2. When database and label disagree, the label wins. Nutrition values are sanity-checked in code.
3. Tagging: dictionary match on ingredient names first (synonym table); the reader and judge handle the rest.
4. Evaluator uses real numbers per serving against the daily budgets in the user's Limit rules.

### 6.4 Supplements and OTC (later)
Barcode or label photo -> active ingredients -> drug ids -> rules; OTC adds the FDA label fields
`ask_doctor`, `ask_doctor_or_pharmacist`, `do_not_use`, matched to the profile and quoted; duplicates checked against "What I take".

### 6.5 Evaluator decisions

Hard rule (Never / Avoid) against one item. The evaluator receives one `HardCheck` per item and rule (section 7),
holding each check's result separately; it does the merging.

| Evidence | Result |
| --- | --- |
| Tag present with origin label, database or restaurant | **blocked** |
| Anyone answered "Yes" for this dish at this restaurant | **blocked** (shared with all users, kept) |
| Inferred, and code match, or judge probability >= high, or reader second pass says yes | **blocked** ("likely contains") |
| Inferred, and judge between low and high, or reader says maybe, or the checks disagree | **ask** (generate a question) |
| Inferred, every available check low | no flag; for Never rules add **confirm** |
| Judge has no opinion (not built yet, no key, call failed) | decide on code and reader alone; a Never rule can then reach at best **confirm**, an Avoid rule at best no flag |
| This user answered "No" for this dish here | the question is replaced by "you confirmed on <date>"; the dish may rank normally; asked again after 30 days or when the menu text changes |

Restaurant identity: the name read from the menu plus the phone's location rounded to about 100 m; the user
confirms the name on the first scan. With no location or name, answers apply to that scan only.

Starting thresholds, to be replaced by benchmark results: Never high 0.5 / low 0.1; Avoid high 0.7 / low 0.3.

Verdict for an item
- any blocked -> Not a fit
- else any ask on a hard rule -> Can't tell
- else by soft score -> Good fit or Okay, with notes

Soft rule (Limit) with numbers: share of the daily budget per serving. Starting bands: up to 20% fine,
20-40% a note, over 40% counts against. Without numbers: the reader's low / medium / high level.
"Keep steady" rules never block; they add a note.

### 6.6 Models and their jobs

| Job | Done by |
| --- | --- |
| Read photos; the per-rule safety check; pick food sentences from FDA labels; match package warnings to the profile | Claude `claude-opus-5-5` (`READER_MODEL`, `CHECK_MODEL`), structured output |
| Tag dishes and ingredient lists | `TAG_MODEL`, currently `claude-haiku-5-5` on the shared backend for speed; code's literal matching and the per-rule check sit behind it |
| Ranking lines, summaries, explanations, follow-up answers | `EXPLAIN_MODEL`, currently `claude-sonnet-5-5` |
| Narrow yes/no and scoring judgments with probabilities | Jev (TypeSafe), behind one function `judge()`; optional at runtime |
| Text positions on the photo | On-device text recognition |
| Everything that decides | Code in `engine/` |

Jev facts (from its docs, 2026-11-14; index at https://docs.typesafe.ai/llms.txt)
- One request = a state (text, JSON, images) + typed questions answered in parallel. Types: Noul (yes/no ->
  probability), Choice, Score, Box. JavaScript SDK: `@typesafe-ai/sdk`. Model `jev-latest` (1.14).
- It judges the state it is given; do not rely on its own food knowledge. Put the knowledge in the state.
- Images and Box are experimental (opt-in header; 280-1568 px per side; PNG or JPEG). Do not use it to read menus.
  That size cap applies only to images sent to the judge, not to the reader's photo.
- No published calibration: thresholds come from our benchmark. Noul gives no separate confidence; near 0.5 means unsure.
- Weak at: literal-minded readings of vague questions, arithmetic, counting, long or irrelevant state,
  multi-step reasoning; it leans toward the first option of a Choice.
- Question style: one narrow condition each, spelled out ("contains, or is commonly prepared with, tree nuts").
  One dish per request.
- If the key is missing or the call fails, `judge()` returns "no opinion" and the evaluator follows the
  "no opinion" row in 6.5: it decides on code and reader alone and never fully clears a Never rule.

---

## 7. Shared formats (the contract between people)

**`engine/types.ts` is the contract.** Read it there; it is commented field by field and this file no longer keeps a
copy that can drift. It defines `Item`, `ItemTag`, `Nutrients`, `Rule`, `HardCheck`, `Finding`, `Verdict`, `Profile`,
`MedicationStatus`, `ScanRecord`, `RankedItem` and `ScanQuestion`. `fixtures/scan.done.json` is a finished example.
Change it only by agreement; everything else can move freely.

Changes since the first version (2026-11-14), all additive: nothing was removed or renamed.
- `HardCheck.code` can also be `"hides_in"` (the dish names something that commonly contains it, such as pesto).
- `Rule.status` can also be `"sourced"` (quoted from a public health page, quote machine-checked).
- `Item.kind` is used with `"supplement"` and `"otc"` as well as `"dish"` and `"product"`.
- `Item.incomplete` (optional): part of the label could not be read.
- `Nutrients.addedSugarG` (optional).
- `Finding.ruleId` is optional; `Finding.source` and `Finding.about` (optional) carry a quote from a medicine's own
  package and the profile item it applies to.
- `ScanRecord.restaurantName` and `ScanRecord.notice` (optional). Show `notice` when present.
- `ScanRecord.provisional` (optional): true while the verdicts are the fast first pass, not yet confirmed.
- `ScanRecord.questions` holds "ask" questions only; "confirm" reminders are findings on each dish.
- New type `MedicationStatus`, returned by `profile.medications`.

### 7.1 Backend functions the app calls

The app talks to the backend only through these Convex functions. All are live on the shared development backend
(`EXPO_PUBLIC_CONVEX_URL` in `.env.example`).

| Function | Kind | Purpose |
| --- | --- | --- |
| `scans.generateUploadUrl()` | mutation | Returns a one-time URL; the app uploads the photo to it and gets a storage id |
| `scans.start({ deviceId, imageId?, barcode?, location?, lines? })` | mutation | Creates a scan and starts the pipeline; returns `scanId`. Photo, barcode, or both. `location` ({lat, lng}) lets answers be remembered per restaurant; `lines` ([{text, box}], text the phone recognised on the photo) gives each dish a `position` |
| `scans.get({ scanId })` | query (live) | The `ScanRecord`. The result screen subscribes to this and draws whatever is there |
| `scans.list({ deviceId })` | query | History: scanId, createdAt, status, kind, title, itemCount |
| `scans.answer({ scanId, questionId, value })` | mutation | Records yes / no / skipped; verdicts, ranking and questions update at once, and the answer is remembered for that restaurant |
| `scans.addPage({ scanId, imageId })` | mutation | Adds another menu photo and reads the whole menu again |
| `scans.setRestaurant({ scanId, name, location? })` | mutation | The user confirms or corrects the restaurant name |
| `followups.ask({ scanId, itemId?, text })` | action | Returns the answer text for a follow-up question |
| `profile.get({ deviceId })` / `profile.save({ deviceId, profile })` | query / mutation | The `Profile`; saving recompiles rules |
| `profile.medications({ deviceId })` | query (live) | Per medication: `state` (pending, rules, no_rules, not_recognised, no_label, failed) and `ruleCount`. Show "reading the label..." while pending, and say so plainly when a name was not recognised |
| `rules.list({ deviceId })` | query (live) | The compiled `Rule[]` (each also has `custom: boolean`), strongest level first |
| `rules.notes({ deviceId })` | query | For conditions that produced no rules: why (source says there are none, or not covered yet) |
| `rules.update({ deviceId, ruleId, enabled?, level? })` | mutation | Switch a rule off or change its level |
| `rules.addCustom({ deviceId, tag, level, reason?, budget? })` / `rules.removeCustom({ deviceId, ruleId })` | mutation | The user's own rules |
| `lookup.medications({ term })` / `lookup.conditions({ term })` | action | Autocomplete suggestions (`[{ name }]`) |
| `lookup.options()` | action | Fixed choices for chips: allergies, diets, and the conditions that have sourced rules |

`deviceId` is a random id the app creates once and keeps; it stands in for an account.

What the app should know about how these behave
- A scan fills in as it runs. Menu, with typical times on a 14-dish menu:
  1. dish names, no verdicts yet (`status: "judging"`, about 7 s);
  2. **provisional verdicts** a fraction of a second later: `provisional: true`, with `verdicts` and `ranking` filled
     from the judge's fast first pass. Show them, marked as still being checked ("checking..."). `questions` is empty
     at this point on purpose: do not ask the user anything on a provisional result. A dish can change section;
  3. confirmed verdicts, questions and a plain ranking (`status: "ranking"`, `provisional` gone, about 13 s);
  4. the summary and worded ranking (`explaining`), then per-dish explanations (`done`, about 19 s).
  Draw each stage as it arrives. A product scan goes through the same stages with one item.
- `kind` tells you what was scanned: `menu`, `label` (ingredient or facts panel read from a photo), `product` (barcode).
  A product scan has exactly one item, whose `kind` is `product`, `supplement` or `otc`.
- A failed scan has `status: "failed"` and a sentence in `error` that is written to be shown to the user, including
  what to do next ("photograph the ingredient list instead").
- `questions` holds only real unknowns to put to the server. The standing "confirm no X" reminder is a `confirm`
  finding on each dish, not a question.
- A finding normally has a `ruleId`; look the rule up in `rules.list` to show its source. A finding from a medicine's
  own package (an "ask a doctor before use if..." line, or an ingredient the person already takes) has no `ruleId`;
  it carries `source: { title, quote }` and `about` (the profile item) instead. `unsourced: true` marks the assistant's
  own note, which must be labelled as such.
- After `profile.save`, allergy, diet and condition rules exist at once. Medication rules are read from each drug's FDA
  label in the background and appear in `rules.list` a few seconds later (it is a live query, so the list just grows).
  A scan started while labels are still being read waits for them (up to 30 s); if it had to go ahead without them,
  the record carries a `notice` saying so.
- A product known only from a barcode never clears a Never rule outright: the database can say an allergen is there,
  not that it is not. The item carries a `confirm` finding telling the person to check the package. A label photo,
  read in full, is believed.
- Rule `status`: `library` (the user's own entry, or clinician-reviewed), `sourced` (quoted from a public health page,
  quote machine-checked), `from_label` (quoted from the drug's FDA label, machine-checked), `unverified`.
- `node bench/tryScan.mjs <photo> [--barcode ...] [--meds "a,b"] [--conditions "x"] [--allergies "tree_nuts"]` runs
  a scan from the command line and prints the result.

## 8. Stack and layout

- App: Expo SDK 58 + React Native + TypeScript, file-based routing under `src/app`. Expo Go is enough through step 7; step 8 needs a
  development build for on-device text recognition (unverified which module; check then).
- Backend: Convex. Queries and mutations for data, actions for model and lookup calls, file storage for photos.
  Photos are uploaded to storage and passed by id, never as function arguments.
- No sign-in yet: one profile per device id.
- Tests: Vitest on `engine/` (pure functions only). No DOM shim.

```
src/        the app: screens (src/app, file-based routes), components, hooks      [app side]
convex/     backend functions: schema, scans, profile, rules, lookup, readers/, judge, explain   [backend side]
engine/     pure TypeScript, no network: types, evaluate, tagMatch, compileRules, budgets + tests [backend side]
data/       tags.json, rules/*.json, hidesIn.json, synonyms.json, drugClasses.json                [backend side]
fixtures/   scan.done.json, profile.json: example data the app is built against                   [shared]
bench/      menus with published allergen charts, and the script that scores us against them      [backend side]
```

Environment variables (never committed): `ANTHROPIC_API_KEY`, `READER_MODEL`, `TYPESAFE_API_KEY` (optional),
Convex deployment URL.

Hackathon requirements, each doing real work
- Convex: the whole backend, including the live-updating scan record.
- Capy: parallel coding tasks cut along the contract in section 7 (a reader, a screen, a data file), each as a pull request.
- Revyl: the scan flows run on devices as repeatable tests.
- Optional if a track rewards them: Supermemory for per-restaurant answers and the later learning loop.

External data
| Need | Source | Status |
| --- | --- | --- |
| Drug and condition autocomplete | NLM Clinical Tables (`rxterms`, `conditions`) | checked, works |
| Drug id, brand -> drug, spelling | NLM RxNorm | checked, works |
| Drug -> class | RxNorm class lookup, cached into `data/drugClasses.json` | to check |
| Grocery products by barcode | Open Food Facts | checked: found 5 of 8 US samples; data sometimes wrong |
| Second barcode source | USDA branded foods | to check |
| OTC and prescription label text | openFDA drug labels | field names checked; barcode lookup to check |
| Menus with true allergen content | Chain restaurants' published allergen charts | to collect |
| Drug-drug interaction API from NLM | discontinued 2024; do not use | checked |

## 9. Accuracy and the benchmark

Measures built into the pipeline
1. Evidence for every tag.
2. Three independent checks on hard rules (code, judge, reader second pass); agreement required to stay quiet.
3. "Commonly hides in" lists per allergen and avoided ingredient.
4. Real numbers whenever a label has them.
5. Label beats database.
6. Drug class by lookup.
7. Restaurant-published information outranks inference.
8. User answers and corrections remembered per restaurant.
9. Rule library reviewed by the team's clinical lead before a rule is marked "library".

Benchmark (`bench/`, run with `npm run bench`)
- Input: dish names from a chain that publishes its allergen declarations. Truth: the chain's own declarations.
- Each allergen is tested as a Never rule. "Caught" means blocked or turned into a question; "missed" means the dish
  contains the allergen and we raised nothing.
- First run, 2026-11-14, Chick-fil-A, 96 dishes of 276, 8 allergens, judge off (`bench/reports/`):
  211 of 211 real cases caught (156 blocked outright), none missed; 162 of 557 allergen-free cases (29%) flagged anyway.
  With the per-rule second pass switched off: 72% caught, 60 missed, 8% flagged anyway. The second pass is what closes
  the gap, and it is also where the needless flags come from.
- Limits of this test: one chain, fast food, names with no descriptions; the reader may already know this chain's
  menu, which flatters the score; allergens only (nothing about drug-food or nutrient rules). No tune/report split
  yet, because no thresholds were tuned on it. Add more chains, including lesser-known ones, before quoting a number.
- Second run, same 96 dishes, judge on (Jev 1.14, about 0.13 s per request):
  - With everything on: still 211 of 211 caught, none missed, but 164 needless flags (29.4%) against 148 (26.6%) without
    the judge, and fewer outright blocks, because a judge that disagrees turns a block into a question.
  - Judge without the second pass: 87% caught (27 missed), against 71% for code and first-pass tags alone. So Jev adds
    real recall on its own, but well short of the second pass.
  - Could a low Jev probability cancel a needless question? No. Real allergen cases scored as low as 0.02 (a frosted
    drink that contains dairy; a biscuit that contains soy). Cancelling below 0.05 would cut flags to 20% and miss 2
    real cases; below 0.1, 14% and 15 misses.
  - Decision: the judge has no say in the FINAL verdict (`JUDGE_ENABLED` unset). On this evidence it does not earn a
    place in the safety path. It is used for what it is good at, speed: as soon as the photo is transcribed it reads
    every dish in about 0.3 s and its result is shown as provisional until the careful check replaces it (about 6 s
    later). Provisional verdicts are never merged into the final ones. Its probabilities reflect what the dish text says, and these
    names say little; a test on menus with descriptions, where it has more to judge, is the fair next trial.
- About 30 hand-written evaluator cases became about 150 across `engine/`, run by `npm test`.

Known limits to state honestly in the product
- A menu never tells us what is in the kitchen; cross-contact is invisible to us.
- Published charts cover chains; independent restaurants are inference plus the user's own questions.

---

## 10. Build order

One continuous sequence, independent of who does which part.
Each phase ends with something that can be checked. Later phases don't start until the check passes.

**Status on 2026-11-14 (backend side).** Phases 1-7 and 9 have their backend built and run against the live backend;
phase 8 has its backend half (positions from the phone's text lines). What each one does is described in 7.1 and in
sections 6 and 9. Still open on the backend:
- The judge (Jev) gives the fast provisional pass; it has no say in final verdicts, on the benchmark evidence (section 9).
- Reading the photo is now the longest wait (about 7 s). `TRANSCRIBE_MODEL=claude-haiku-5-5` cut it to about 4.5 s with
  identical text on two generated images; not switched on because no real phone photo has been tested.
  Thresholds in 6.5 are still the starting values.
- The benchmark covers one chain and allergens only (section 9).
- Tested with generated menu and label images and real barcodes, not yet with photos taken on a phone.
- Rules for conditions and medications are machine-checked against their sources but not clinically reviewed.
- `productCache` / `tagCache` tables do not exist; every scan calls the models again.
- A second-pass check can answer differently on two runs of the same menu (model variation).

**Phase 0 — Foundation**: repo, Expo template, shared formats, fixtures, tests, Convex project. Done.

**Phase 1 — Engine**: `engine/` (evaluate, tagMatch, budgets, tags, compileRules, labelRules, product, otc, memory,
pipeline) with `data/` (tags, synonyms, hidesIn, supplementNames, dailyValues, rules/). Done, 153 tests.

**Phase 2 — Menu scan**: backend done. App half: camera, upload, result card drawing the live scan record.
Check: a photo of a real menu gives a ranked list with reasons and "ask your server" questions on the phone.

**Phase 3 — Profile and Your rules**: backend done (allergies, diets, 14 conditions with sourced rules, medications
read from FDA labels). App half: setup screens with autocomplete, Your rules screen with source view and switches.
Check: entering "zocor", "lisinopril", "high blood pressure" and "tree nuts" yields the right rules with sources.

**Phase 4 — Grocery scan**: backend done (barcode via Open Food Facts, label photo, label beats database, numbers
against the person's limit or the FDA Daily Value). App half: barcode capture, product result, Compare view.
Check: five real products give correct allergen flags and sodium shares; an unknown barcode asks for a label photo.

**Phase 5 — Follow-ups and second-opinion notes**: backend done. App half: the question box and showing the answer.

**Phase 6 — Jev and the benchmark**: judge wired, benchmark built (`npm run bench`). Open: run with a key; add chains.

**Phase 7 — Answers remembered per restaurant**: backend done. App half: answer buttons, sending `location`,
confirming the restaurant name.

**Phase 8 — Boxes on the menu photo**: backend matches the phone's recognised text lines to dishes in code. App half:
development build, on-device text recognition, sending `lines`, drawing `position` boxes coloured by verdict.

**Phase 9 — Supplements and OTC medicine**: backend done (Drug Facts warnings matched to the profile and quoted,
duplicate active ingredients, supplements checked against rules read from the person's medication labels).
App half: showing label findings and "Question for my pharmacist".

**After that:** "how did that sit?" and the personal response model; health-record import; accounts and sharing.

### Verification

- `npm test`: evaluator and rule-compiler cases on every change.
- `npm run typecheck`.
- `npm run bench` on any change to reader prompts, Jev questions, tags or hides-in lists.
- `npm run verify:sources` on any change to `data/rules/conditions.json` or `data/dailyValues.json`.
- Each phase's check performed on a real phone, with real menus and products.
- Revyl flows for: setup -> rules; menu scan -> result; barcode scan -> result.

Who builds what
- **App side** (Gautam): everything under `src/`, `assets/`, `app.json`. Built against `fixtures/` first, then
  switched to the live functions in 7.1 as each one lands. Phases 2-5 and 7-8 each have an app half.
- **Backend side** (Prathyek): `convex/`, `engine/`, `data/`, `bench/`, and keeping `fixtures/` true to what the
  backend really returns. Phases 1, 3 (compiler), 6 and 9 are mostly backend.
- Shared, change by agreement only: `engine/types.ts`, `fixtures/`, section 7 of this file, `package.json`
  (say so in the pull request when adding a dependency).
- The live scan record is the meeting point. When a backend function goes live, the backend side posts which
  one, and the app side swaps the fixture for it.

Working agreements
- One repository, short-lived branches, small pull requests, plain descriptive commit messages
  (for example `Add tree-nut hides-in list`).
- `engine/` has no network calls and no framework imports, so it stays testable.
- New fields on stored records are optional on read; old records must keep loading.
- A prompt or question change that touches hard rules needs a benchmark run in the pull request description.
- Data files are reviewed like code. A rule without a source cannot have status "library".
- Health data: stored only in our backend; no analytics or third-party logging of profile contents. What does
  leave the backend, to the model providers, is the photo, item text, rule text and the profile labels that
  rules refer to ("simvastatin", "tree nut allergy"). Never a name, contact detail or device identifier.

## 11. Open items

1. App name.
2. Who builds which part, if the work is split.
3. Accounts and keys: Convex, Capy, Revyl, the language-model provider, TypeSafe.
4. Which phones the team tests on.
5. Regulatory position before any public release. Unresolved: FDA's 2026 decision-support guidance addresses
   clinician-facing tools, and a patient-facing one probably falls under its older mobile medical app policy.
   Get advice before launch, not before building.
