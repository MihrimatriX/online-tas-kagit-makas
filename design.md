# Design — RPS Arena

Locked design system for the app. New screens extend this; they don't invent a new look.
Tokens live in [`frontend/src/tokens.css`](frontend/src/tokens.css); styles in [`frontend/src/styles.css`](frontend/src/styles.css).

## Direction: "Turnuva kağıdı"

A printed tournament draw sheet: warm newsprint, dark ink, one signal red. Hairlines and
double rules instead of cards and shadows. The bracket should look like a fixture sheet
someone is marking up — losers struck through, the live match flagged in red.

Genre: editorial · light only (deliberate: it is paper).

## Colour (OKLCH, anchor hue ~80)

| Token | Value | Use |
| --- | --- | --- |
| `--color-paper` | `oklch(95.6% 0.016 84)` | page |
| `--color-paper-2/3` | 92.6% / 88.6% | command block, hover, timer track |
| `--color-rule` | `oklch(78% 0.022 76)` | hairlines |
| `--color-ink` | `oklch(22% 0.016 60)` | text, heavy rules, primary buttons |
| `--color-ink-2/3` | 37% / 46% | secondary / muted text (≥ 4.5:1 on paper) |
| `--color-accent` | `oklch(53% 0.19 31)` | the one red: current tab, live markers, primary admin CTA, "you" |
| `--color-accent-wash` | `oklch(91.5% 0.04 42)` | your row / your match / a won round |
| `--color-chroma` | `#00ff00` | OBS key background only |

Accent stays under ~5 % of any screen. Emphasis is carried by weight, a red underline, or a strike-through — never by a second hue.

## Type

- Display: **Big Shoulders Display** 700–900, uppercase, roman, tracking ≥ 0. Headings, scores, codes, buttons, tabs.
- Body: **IBM Plex Sans** 400/500/600.
- Two families only. Numerals that change (scores, clocks) use `tabular-nums`.
- All-caps display line-height ≥ 1.02 when it can wrap; single-line digits may go to 0.85.

## Components

- **Buttons:** 1.5px ink border, 2px radius, display font uppercase, never wrap. `--ink` primary, `--accent` only for the admin's next step, `--quiet` is an underlined text button.
- **Inputs:** underline only (a form on paper), accent underline on focus.
- **Section heads (`.sheet-head`):** display heading + right-aligned meta, ink rule below. No eyebrows/kickers except the "Sıradaki adım" label.
- **Lists:** ruled rows (`border-bottom: hairline`), not cards. No card-in-card.
- **Move icons:** hand-drawn SVG objects (stone, sheet, scissors), stroke `currentColor` — no emoji.

## Motion

`--ease-out` for everything; only `transform`/`opacity` animate. One count-in pop, one reveal fade, a pulsing live dot. `prefers-reduced-motion` collapses all of it to a short fade.

## Layout

App shell = masthead (double rule) + stage + live rail. Stage-level layouts switch on **container queries** (`.stage` is the container), so the rail beside it never squeezes a two-column lobby. Verified with no horizontal scroll at 320 / 375 / 414 / 768 px.
