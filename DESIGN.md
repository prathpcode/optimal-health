---
name: Fit
description: See how a menu or grocery item fits you.
colors:
  table-linen: "#F6F6F4"
  plate-white: "#FFFFFF"
  napkin-grey: "#F0F0EE"
  ink: "#0B0B0C"
  graphite: "#6B6B70"
  fog: "#A3A3A8"
  hairline: "rgba(0,0,0,0.06)"
  herb-green: "#1FA463"
  saffron: "#E8A317"
  chili-red: "#E5484D"
  pewter: "#8E8E93"
  herb-green-soft: "rgba(31,164,99,0.12)"
  saffron-soft: "rgba(232,163,23,0.14)"
  chili-red-soft: "rgba(229,72,77,0.12)"
  pewter-soft: "rgba(142,142,147,0.14)"
  night-ink: "#0B0B0C"
  night-card: "#1A1A1C"
  night-card-muted: "#232326"
  night-text: "#F5F5F4"
  smoked-glass: "rgba(28,28,30,0.55)"
typography:
  display:
    fontFamily: "SF Pro (system)"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: "40px"
    letterSpacing: "-0.6px"
    fontFeature: "tnum"
  title:
    fontFamily: "SF Pro (system)"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: "28px"
    letterSpacing: "-0.3px"
  headline:
    fontFamily: "SF Pro (system)"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: "22px"
    letterSpacing: "-0.2px"
  body:
    fontFamily: "SF Pro (system)"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "21px"
  body-strong:
    fontFamily: "SF Pro (system)"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: "21px"
  caption:
    fontFamily: "SF Pro (system)"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "18px"
  micro:
    fontFamily: "SF Pro (system)"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: "13px"
    letterSpacing: "0.6px"
rounded:
  sm: "10px"
  button: "16px"
  md: "18px"
  card: "24px"
  sheet: "28px"
  chip: "999px"
spacing:
  xxs: "2px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
  xxxl: "32px"
  huge: "48px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.plate-white}"
    typography: "{typography.headline}"
    rounded: "{rounded.button}"
    height: "54px"
    padding: "0 20px"
  button-secondary:
    backgroundColor: "{colors.plate-white}"
    textColor: "{colors.ink}"
    typography: "{typography.headline}"
    rounded: "{rounded.button}"
    height: "54px"
    padding: "0 20px"
  card:
    backgroundColor: "{colors.plate-white}"
    rounded: "{rounded.card}"
    padding: "20px"
  card-muted:
    backgroundColor: "{colors.napkin-grey}"
    rounded: "{rounded.card}"
    padding: "20px"
  chip:
    backgroundColor: "{colors.plate-white}"
    textColor: "{colors.ink}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.chip}"
    height: "40px"
    padding: "0 16px"
  chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.plate-white}"
    rounded: "{rounded.chip}"
    height: "40px"
  verdict-pill-good:
    backgroundColor: "{colors.herb-green-soft}"
    textColor: "{colors.herb-green}"
    typography: "{typography.caption}"
    rounded: "{rounded.chip}"
    padding: "5px 10px"
  verdict-pill-not-fit:
    backgroundColor: "{colors.chili-red-soft}"
    textColor: "{colors.chili-red}"
    typography: "{typography.caption}"
    rounded: "{rounded.chip}"
    padding: "5px 10px"
  segmented:
    backgroundColor: "{colors.napkin-grey}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.button}"
    height: "40px"
    padding: "4px"
---

# Design System: Fit

## Overview

**Creative North Star: "The Menu Companion"**

Fit lives beside the meal. It sits on the table next to a real menu or in a hand in a grocery aisle, so the interface is light, native, and close at hand rather than a destination app. Surfaces are warm linen and plate white (night ink in dark mode), type is the iOS system face, and almost nothing on screen is coloured, so the one thing that is (the verdict) reads instantly.

Over the camera and the photo, controls become smoked glass (iOS liquid glass where available) so the real menu stays the hero. Off the camera, content sits on soft white cards with generous corners. Everything a finger touches springs gently and answers with a light haptic: soft and friendly, never showy.

Fit is not a diet app. It does not cheer, gamify or celebrate; it helps you choose, calmly.

**Key Characteristics:**
- Near-monochrome neutrals; colour reserved for the four verdicts and community room accents.
- iOS-native: system font, SF Symbols, native tabs, liquid glass over the camera.
- Soft, generously rounded shapes (16 to 28px corners, pill chips).
- Springy, haptic press feedback on every tappable surface; reduced-motion fallbacks everywhere.
- Light and dark themes from one token set (`src/theme/tokens.ts`); a fixed on-photo palette for camera surfaces.

## Colors

A quiet table setting of linens and ink, with four food-warm signal colours that only ever mean a verdict.

### Primary
- **Ink** (`ink`): text and the primary button fill. In dark mode it flips to Night Text, and the primary button becomes light-on-dark.

### Secondary
- **Verdict set**: **Herb Green** (Good fit), **Saffron** (Okay, with notes), **Chili Red** (Not a fit), **Pewter** (Can't tell). Each has a soft tint (12 to 14% alpha) for pill and section backgrounds. Dark mode uses brighter variants (#34C77B, #F2B63D, #FF6369, #A1A1A6) with 16 to 18% soft tints.

### Tertiary
- **Room accents** (`roomAccent` in tokens): one hue per community room (heart #FF5A5F, kidney #3D8BFF, diabetes #8B6CFF and so on), used at low opacity for room tiles and at full strength for the room icon only.

### Neutral
- **Table Linen** (`table-linen`): the screen background in light mode.
- **Plate White** (`plate-white`): cards and secondary buttons.
- **Napkin Grey** (`napkin-grey`): muted cards, segmented tracks, skeletons, empty ring track.
- **Graphite** (`graphite`) and **Fog** (`fog`): secondary and tertiary text.
- **Hairline** (`hairline`): borders on secondary buttons and chips, and card outlines in dark mode.
- **Night Ink / Night Card / Night Card Muted** (`night-*`): the dark-theme background and surfaces.
- **Smoked Glass** (`smoked-glass`): the glass fallback over the camera when liquid glass is unavailable or Reduce Transparency is on.

### Named Rules
**The Verdict Owns Colour Rule.** Green, amber, red and grey mean Good fit, Okay, Not a fit and Can't tell, and nothing else. Never use them for decoration, branding, success toasts or progress.

**The Never Alone Rule.** A verdict colour always travels with its words (`FIT_LABEL`) or an icon. Colour is never the only signal.

## Typography

**Display Font:** SF Pro (iOS system font), via React Native's default
**Body Font:** SF Pro (system)

**Character:** One family, tuned by weight and tracking: tight and bold at the top, relaxed at reading size. It feels native because it is native.

### Hierarchy
- **Display** (700, 34/40, -0.6 tracking, tabular figures): screen titles and big numbers (points, counts).
- **Title** (600, 22/28): section and card titles.
- **Headline** (600, 17/22): button labels, dish names, list row titles.
- **Body / Body Strong** (400 or 600, 15/21): reasons, explanations, chip labels.
- **Caption** (500, 13/18): verdict pills, metadata, secondary lines.
- **Micro** (600, 11/13, +0.6 tracking, uppercase): section labels only (`SectionLabel`).

### Named Rules
**The One Text Component Rule.** All text renders through `T` with a scale variant and a tone. Dynamic Type is honoured up to 1.4× (`maxFontSizeMultiplier`).

## Layout

Single-column phone layout with a 20px screen gutter (`gutter = space.xl`). Spacing follows a 4-based scale (2, 4, 8, 12, 16, 20, 24, 32, 48). Cards pad 20px inside. Lists enter with a staggered fade-and-rise, capped at 8 items so long lists never wait. The result screen is the photo full-bleed with a draggable bottom sheet that snaps between fractions of the screen height. Tabs (Home, Together, Me) use native tabs and handle their own content insets.

## Elevation & Depth

Hybrid. In light mode, cards lift with one soft ambient shadow and floating elements (sheets, on-photo chips) get a stronger one. In dark mode there are no shadows; surfaces separate by tone (card #1A1A1C on ink) plus a hairline border. Over the camera, depth comes from glass, not shadow.

### Shadow Vocabulary
- **Card** (iOS: y 4, blur 8, opacity 0.06; Android elevation 2): resting cards, the segmented thumb.
- **Floating** (iOS: y 8, blur 12, opacity 0.14; Android elevation 8): bottom sheet, menu overlay chips and dots.

### Named Rules
**The Tone-in-the-Dark Rule.** Never add shadows in dark mode. Use a lighter surface tone and a hairline instead.

## Shapes

Soft and friendly: everything is generously rounded and nothing has a sharp corner. Cards are 24px, sheets 28px, buttons 16px, small inner elements 10px, and chips, pills and glass controls are full pills or circles. Borders are hairlines (or 1.5px on secondary buttons and chips), never heavy strokes. The camera's corner brackets are rounded, breathing arcs, not hard crop marks.

## Components

### Buttons
- **Shape:** gently rounded rectangle (16px), 54px tall, full width by default.
- **Primary:** Ink fill with Plate White headline text and an optional leading SF Symbol at 17px. Inverted in dark mode.
- **Secondary:** Plate White fill, 1.5px hairline border, Ink text.
- **Press:** springs to 0.96 scale (snappy spring) with a light haptic; disabled at 40% opacity; loading swaps the label for a spinner.

### Chips
- **Style:** 40px pill, Plate White with a 1.5px hairline, Body Strong label.
- **Selected:** fills with Ink, and a check icon springs in from zero width. A selection haptic fires.

### Verdict Pill
- Soft-tint pill with a verdict dot and the verdict words in the solid colour. The dot pulses grey while a verdict is still provisional, then cross-fades to its colour.

### Cards / Containers
- **Corner Style:** 24px.
- **Background:** Plate White (or Napkin Grey for muted cards, which drop the shadow).
- **Shadow Strategy:** Card shadow in light mode; a hairline border in dark mode.
- **Internal Padding:** 20px.

### Segmented Control
- Napkin Grey track (16px radius, 40px tall, 4px inset) with a Plate White thumb (10px radius, card shadow) that springs between options.

### Navigation
- Native tabs (Home, Together, Me) with SF Symbols that fill when selected, tinted Ink, with Graphite labels.
- Over the camera or photo: round Smoked Glass buttons (44px) with white symbols.

### Menu Overlay (signature)
- Over the photographed menu, each dish gets a verdict-coloured dot and a white floating chip with its name and reason. The chips zoom in, staggered. A sweep line passes while reading.

### Bottom Sheet (signature)
- Plate White, 28px top corners, dragged by its header, with spring snap points and rubber-banding past the ends.

### Rules Ring (signature)
- A ring split into arcs, one per rule level, that draw themselves in on mount around a centred count.

## Do's and Don'ts

### Do:
- **Do** take every colour, size, radius and motion value from `src/theme` (`tokens.ts`, `motion.ts`). Screens define none of their own.
- **Do** wrap every pressable in `Tap` so it springs and gives haptic feedback, and give it an accessibility label.
- **Do** use glass (`GlassSurface` / `GlassButton`) for controls over the camera or photo, and cards everywhere else.
- **Do** provide a reduced-motion path for every animation (fade instead of spring).
- **Do** use the four verdict words exactly: Good fit, Okay, with notes, Not a fit, Can't tell.

### Don't:
- **Don't** drift into diet-app gamification: no confetti, streak flames, cheerleading colour or celebratory bursts. Challenge points are shown plainly, as numbers.
- **Don't** use verdict colours for anything but verdicts.
- **Don't** add shadows in dark mode.
- **Don't** add a brand accent colour; Ink is the brand.
- **Don't** add icons outside `Icon.tsx`; every symbol has an iOS and an Android name there.
