# Optimal health

Point your phone at a restaurant menu or a grocery item and see how it fits **you**: your medications,
conditions, allergies and diet. It ranks what is best, says why, and tells you what to ask when it cannot know.

- `PLAN.md` — the full plan and shared context. Start here.
- `CLAUDE.md` — short working guide for coding assistants.
- `src/` — the Expo app. `convex/` — backend. `engine/` — the pure rules engine. `fixtures/` — example data.

```sh
npm install --no-audit
npx convex dev      # backend (first run sets up the project)
npx expo start      # app
npm test
```
