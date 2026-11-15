# Optimal health (Second Look)

A phone app that tells people with medications, conditions, allergies or dietary restrictions how a restaurant menu
or grocery item fits them. Expo (React Native) app + Convex backend + a pure TypeScript rules engine.

## Stay current

Teammates and their agents push to `main` all the time. Run `git fetch` and `git pull` before you start implementing
any change, and again before each further change in a long session, so you never build on a stale checkout.

## A new worktree

`.env.local` is git-ignored, so a fresh worktree has no Convex address and the app silently falls back to the
bundled sample (`HAS_BACKEND` false). Whenever you create a worktree, copy the env file over from the main checkout
before you run or test anything:

```sh
cp <main checkout>/.env.local .env.local    # e.g. cp ~/code/optimal-health/.env.local .env.local
```

If the main checkout has no `.env.local`, say so and ask for the shared development address; never commit the file
and never paste its contents into a message.

## Layout and ownership

| Side | Folders |
| --- | --- |
| App | `src/` (routes in `src/app`), `assets/`, `app.json` |
| Backend | `convex/` (functions, pipeline, judge), `engine/` (pure rules engine + tests), `data/` (tags, rules, synonyms), `bench/` |
| Shared, change only by agreement | `engine/types.ts`, `fixtures/`, `package.json` |

Ask which side the person you are working with is on, and stay inside it. If a task needs a change on the other
side or to a shared file, say so and propose it; do not just make it.

`engine/types.ts` is the contract between app and backend, commented field by field. The app draws a result from
one thing, the live `ScanRecord` (`scans.get`); `fixtures/scan.done.json` is a finished example. The app calls the
backend only through the public functions in `convex/scans.ts`, `profile.ts`, `rules.ts`, `lookup.ts` and
`followups.ts`, adapted in `src/lib/scan.ts` and `src/lib/profile.ts`. `deviceId` stands in for an account.

## Rules the code must keep

- The app never says "safe". Verdicts: Good fit / Okay, with notes / Not a fit / Can't tell.
- Code in `engine/` decides what is blocked. Models may add caution; no model output can remove or soften a hard flag.
- Absence is not proof. An inferred item (every menu dish, and a product known only from a barcode) never silently
  clears a Never rule: it carries a "confirm" finding. Only a printed label, a database record or the restaurant's own
  published information can clear it. A user's "No, I asked" applies to that user only and shows as "you confirmed".
- No evidence, no tag. Every rule has a source that was fetched and string-matched, or is visibly "unverified".
- The app never tells anyone to take, stop or change a medication.
- Verdicts are recomputed from items + rules, never stored as truth. Arithmetic happens in code, never in a model.
- `engine/` has no network calls and no framework imports. Tests are pure-function tests; no DOM shim.
- New fields on stored records are optional on read.
- Profile contents never go to analytics or third-party logging. Model providers get the photo, item text, rule text
  and profile labels; never a name, contact detail or device identifier. The text-recognition service gets the photo
  and nothing else.

## Vocabulary

Rule levels are Never and Avoid (hard), Limit and Keep steady (soft). A **tag** is a label from `data/tags.json`
attached to a food so it can match rules; it has a **sureness** (certain / likely / unsure) and an **origin** (label,
database, restaurant, menu text, inferred, user). The **reader** turns a photo or barcode into items, the **judge**
(Jev) answers narrow yes/no questions with a probability, and the **evaluator** (`engine/evaluate.ts`) applies rules
to an item and produces a verdict made of **findings** (blocked / ask / note / confirm).

The judge only supplies the fast provisional verdicts (`provisional: true`); it has no say in final verdicts unless
`JUDGE_ENABLED` is set, because on the benchmark real allergen cases scored as low as 0.02 (`bench/reports/`).

## Not built yet

- Shelf view: tuning on real shelves (how boxes line up with the live picture, how fast it feels), and on-device
  text recognition, which is what would make it smooth rather than once a second.
- App: second menu page (`scans.addPage`), on-device text recognition (`lines`; boxes currently come from the
  backend, see below), product Compare,
  condition search and option chips from `lookup`, `rules.notes`, a daily amount on a custom Limit rule. Restaurant
  confirmation and custom rules are built but have not been run on a phone.
- Backend: the benchmark covers one chain and allergens only; the faster photo reader
  (`TRANSCRIBE_MODEL=claude-haiku-5-5`) stays off: on four real phone photos it dropped 13 of 65 dishes from a dense
  menu and changed ingredients in others (`bench/reports/2026-11-15-readers.md`); condition and medication rules are source-checked but not clinically
  reviewed. Judge thresholds are still the starting values: `bench/reports/*-thresholds.md` has what the benchmark
  supports and why adopting it is a product decision, not a drop-in number.
- Later: "how did that sit?" and a personal response model, health-record import, accounts and sharing, a regulatory
  review before any public release.

## How some things behave

- Restaurant memory: a restaurant is its name plus the phone's location rounded to about 100 m (rounded on the phone).
  The app asks for location once, on the result screen, when the person confirms the name. `scans.setRestaurant`
  returns the restaurant id, or null with no location (answers then apply to that scan only); on a finished menu scan
  it also applies what that restaurant has told people before and stores answers already given on the scan.
- Boxes on the menu photo: with `GOOGLE_VISION_API_KEY` set on the deployment, the backend sends the first photo to
  Google Cloud Vision for the position of every printed line. About a second into a scan the record carries
  `textBoxes` (every line, drawn faint); when dish names arrive each dish gets `position` from its own printed words
  (`engine/memory.ts`), and its box takes the verdict's colour as verdicts land. The service only locates text; it
  decides nothing. With no key, or if the call fails, the app falls back to chips in a row. A phone that sends
  `lines` itself (on-device recognition, needs a development build) skips the service.
- Packages on a shelf (`src/app/scan.tsx`, `src/components/ShelfMarks.tsx`, `convex/shelf.ts`, `engine/shelf.ts`):
  there is no separate mode. While the scan camera is open it sends a still to `shelf.look` every so often; when
  the still shows a shelf (`looksLikeShelf`: many short blocks of words side by side, or a product it knows) the
  answer is a box per package and the camera keeps looking about once a second. For a menu, a label or anything
  else it answers with nothing, and the camera behaves as it always did. Packages are found by grouping the recognised text into one
  block per package front, and named by matching those words against products already known by barcode
  (`productCache`); the matcher refuses when two products fit equally or the brand differs. Each still stands alone,
  so nothing is tracked between frames. A recognised product is shown as a good fit only after the careful
  reading of its ingredients is in (the same verdict a barcode scan gives, with the same "confirm" note when a Never
  rule is in play); until then it is "unflagged". Unknown packages get a dashed outline and are identified in the background (`shelf.identify`): the photo
  reader reads each front properly, the product database is searched for it, and a record is accepted only if the
  word match and the judge (Jev: "same product, same variety?") both agree. Nothing is inferred about a product
  that is not in the database. Needs
  `GOOGLE_VISION_API_KEY`. Built and checked against a shelf photo; not yet run on a phone in a store.
- Money races (`convex/pay.ts`, `engine/challenge.ts` `settlePot`): a race can have an entry price; every player pays
  it through a Whop checkout and the winner takes the pool. An entry is "pending" until Whop's webhook
  (`/whop/webhook`) reports the payment and we read it back from Whop's API; only then is the player in. Entries
  close at the start, and leaving before then refunds. An hour after the end the pool (what reached us after Whop's
  fee, in integer cents) goes to first place by Whop transfer; a tie splits it; with fewer than two paid players or
  no dish logged, every payment is refunded. Off unless `MONEY_CHALLENGES=on` (see `.env.example`). Built and
  unit-tested; not yet run against Whop, not even its sandbox.
- A custom rule replaces every rule on its tag. The app will not swap a switched-on profile rule for a weaker custom
  one (`engine/customRules.ts`).
- Cache (`convex/cache.ts`): the answer to one exact tagging or second-pass request is reused for 30 days, a barcode's
  database record for 7. Keys hash the model, instructions and text sent, so only an identical request hits; nothing
  cached depends on a profile. Reading the photo, wording and package-warning matching are never cached.
  `SCAN_CACHE=off` on the deployment turns it off, and the benchmark never uses it.

## Project commands

```sh
npm install --no-audit      # plain `npm install` can stall on the audit step
npx convex dev              # backend owner only: syncs convex/ to the shared development backend
npm test                    # vitest: engine/ and pure helpers
npm run typecheck           # backend and engine types
npm run typecheck:app       # whole app
npm run scan -- <photo>     # run a photo or --barcode through the live backend and print the result
npm run bench               # score the pipeline against a chain's published allergens (uses the model API)
npm run verify:sources      # fetch every cited page and check each quote is on it
npm run bench:readers -- <photos>   # read the same photos with the current and a faster model; lists what the faster one loses
npm run bench:thresholds    # what judge thresholds the last benchmark supports (no model calls)
```

Run `npm run bench` after changing reader prompts, judge questions, tags or hides-in lists, and `verify:sources`
after changing `data/rules/conditions.json` or `data/dailyValues.json`. Backend secrets live on the Convex
deployment (`npx convex env set ...`), never in files; see `.env.example`. Nothing is verified until it has run: say
what you ran and what happened.

## Expo

This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start --tunnel     # start the dev server — ALWAYS pass --tunnel (see below)
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- Always start Expo with `--tunnel` (`npm start`, or `npx expo start --tunnel`). A worktree's dev server is often not
  on the same network as the phone, and the LAN URL then never connects; the tunnel always does. The same goes for
  the platform shortcuts: `npx expo start --tunnel --ios`, `--android`.
- Always end a change to the app with a QR code to try it on: start the tunnelled dev server, read the `exp://` URL
  it prints, and give the QR code (as an image, with the URL beside it) in the message that reports the change. Do
  this without being asked, every time, in every conversation.
- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
