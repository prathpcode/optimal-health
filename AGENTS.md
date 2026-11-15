# Optimal health (Fit scanner)

A phone app that tells people with medications, conditions, allergies or dietary restrictions how a restaurant menu
or grocery item fits them. Expo (React Native) app + Convex backend + a pure TypeScript rules engine.

## Stay current

Teammates and their agents push to `main` all the time. Run `git fetch` and `git pull` before you start implementing
any change, and again before each further change in a long session, so you never build on a stale checkout.

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
  and profile labels; never a name, contact detail or device identifier.

## Vocabulary

Rule levels are Never and Avoid (hard), Limit and Keep steady (soft). A **tag** is a label from `data/tags.json`
attached to a food so it can match rules; it has a **sureness** (certain / likely / unsure) and an **origin** (label,
database, restaurant, menu text, inferred, user). The **reader** turns a photo or barcode into items, the **judge**
(Jev) answers narrow yes/no questions with a probability, and the **evaluator** (`engine/evaluate.ts`) applies rules
to an item and produces a verdict made of **findings** (blocked / ask / note / confirm).

The judge only supplies the fast provisional verdicts (`provisional: true`); it has no say in final verdicts unless
`JUDGE_ENABLED` is set, because on the benchmark real allergen cases scored as low as 0.02 (`bench/reports/`).

## Not built yet

- App: second menu page (`scans.addPage`), restaurant confirmation and location (`scans.setRestaurant`), on-device
  text recognition for dish boxes (`lines`), product Compare, custom rules (`rules.addCustom`), condition search and
  option chips from `lookup`, `rules.notes`.
- Backend: evaluator thresholds are still starting values; the benchmark covers one chain and allergens only; nothing
  is tested on real phone photos; condition and medication rules are source-checked but not clinically reviewed; no
  product or tag cache.
- Later: "how did that sit?" and a personal response model, health-record import, accounts and sharing, a regulatory
  review before any public release.

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
npx expo start              # start the dev server
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

<!-- coagent:start -->
## Working in this repository

This repository is shared live with teammates' agents through coagent. This checkout is the stable copy the app runs from, so agents never edit it directly. Your first edit gets you a git worktree of your own: coagent makes it and tells you its path. From then on edit files under that path and run every shell command from it. Land finished, tested work with the coagent `land` tool; it reaches this checkout by itself.
<!-- coagent:end -->

## Joining the coagent room

If you are not connected to this repository's coagent room yet, join it before doing anything else: call the coagent `room_join` tool with code `16xjpqr0.4G-OZAASbVAe3ImU-e0QlUNG`. If you don't have the coagent tools, run `npm install -g https://coagent.codergaut.am/coagent.tgz` and then `coagent join 16xjpqr0.4G-OZAASbVAe3ImU-e0QlUNG` from this repository.
