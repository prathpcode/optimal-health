# Product

<!-- impeccable:product-schema 1 -->

## Platform

ios

iOS-first: iOS conventions lead (system glass, SF Symbols, native tabs). Android gets working fallbacks, not its own
design language. Built with Expo (React Native); the app name on device is "Fit".

## Users

Adults managing their own health: medications, conditions, allergies or dietary restrictions. They use Fit in the
moment of choosing food: seated at a restaurant table with a menu in hand, or standing in a grocery aisle holding a
product. They are often with other people, short on time, and want a quick, trustworthy read, not a lecture.

## Product Purpose

Point the phone at a restaurant menu or a grocery item (photo or barcode) and see how each dish or product fits *you*.
Fit ranks what fits best, says why, and tells you what to ask when it can't know. Alongside the scanner, Fit puts you
in rooms with people who share your conditions or diet, and runs group challenges scored from your real scans and
check-ins.

Success: the person orders or buys with confidence, knows exactly what to ask staff when something is uncertain, and
comes back because the people in their rooms keep them going.

## Positioning

Fit doesn't give generic "healthy" scores. It applies *your* rules (Never / Avoid / Limit / Keep steady), with
deterministic code deciding what is blocked and models only allowed to add caution. Every rule cites a source that was
fetched and checked. Fit is honest about uncertainty: an inferred menu dish never silently clears a Never rule. The
community is matched to the same profile, so the people you meet are managing what you're managing.

## Operating Context

- Scanning: camera at a menu page, a photo from the library, or a barcode. Results arrive provisional first, then final.
- Restaurant memory: a restaurant is its name plus location rounded to about 100 m. Answers staff gave ("No, I asked")
  are remembered for that restaurant.
- Profile: conditions, medications, allergies, diets and custom rules. `deviceId` stands in for an account.
- Community: sign in with Whop (OAuth on the phone; Whop gets only the sign-in, never profile contents). Rooms come
  from the profile via `engine/communityMatch`. Challenges are scored in code (`engine/challenge`) from scans and
  check-ins.

## Capabilities and Constraints

- Verdicts are exactly: **Good fit / Okay, with notes / Not a fit / Can't tell.** The app never says "safe".
- Findings: blocked / ask / note / confirm. Tags carry a sureness (certain / likely / unsure) and an origin (label,
  database, restaurant, menu text, inferred, user).
- The app never tells anyone to take, stop or change a medication.
- Verdicts are recomputed from items and rules, never stored as truth; arithmetic happens in code, never in a model.
- Profile contents never go to analytics, third-party logging, or Whop.
- Community state today: room membership and your own challenge points are real. Other members, messages and their
  scores are a local preview (`PREVIEW = true`), and the screens must say so. Paid challenge entry and payouts are not
  live (`MONEY_LIVE = false`).
- Not built yet: second menu page, on-device dish boxes, product Compare, condition search, daily amount on custom
  Limit rules, accounts and sharing beyond Whop sign-in. Condition and medication rules are source-checked but not
  clinically reviewed. A regulatory review comes before any public release.

## Brand Commitments

- Name: **Fit**.
- Voice: plain, calm, specific. Short sentences. Says what it knows, what it doesn't, and what to ask. Never alarmist,
  never cheerleading, never medical advice.
- Permission copy sets the tone: say what the access is for, in one sentence (see `app.json`).

## Evidence on Hand

- `fixtures/scan.done.json`: a finished scan record; the sample menu in the app.
- `bench/reports/`: benchmark results (one chain, allergens only).
- Room member counts and other members in community screens are preview data, not real users. Do not present them as
  real, and do not invent testimonials, user counts, clinical endorsements or accuracy claims.

## Product Principles

1. **Honest over reassuring.** Uncertainty is shown, never hidden. "Can't tell" with a good question beats a guess.
2. **Code decides, models assist.** Nothing from a model can remove or soften a hard flag.
3. **It's the user's rules.** Fit applies their profile; it doesn't moralize about food.
4. **Fast at the table.** Someone with a menu and a waiter waiting should get the answer in seconds.
5. **Private by default.** Health details stay on the profile; community shows rooms and points, not diagnoses.

## Accessibility & Inclusion

No formal standard has been set yet (open decision). Inferred from the use context, not confirmed: users may be on
medications that affect vision or focus and are often in dim restaurants, so verdicts should never rely on colour
alone, text should work with Dynamic Type, and every control needs an accessibility label (the existing code already
sets these).
