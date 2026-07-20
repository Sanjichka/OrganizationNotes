# Design System

Extracted from [`design/Orgo.dc.html`](../design/Orgo.dc.html), which is the
canonical reference. Where this document and the mockup disagree, the mockup
wins — but please fix this document.

Everything here is expressed in **OKLCH**, because the whole colour system is one
formula parameterised by hue. Converting to hex would destroy the thing that
makes it work.

---

## 1. The colour idea

Each day owns one hue. Priority is rendered as **lightness within that hue** —
the top task is the most saturated and darkest, the bottom task is nearly white.
A day's list therefore reads as a single gradient, and a glance tells you where
the weight is.

Nothing about shading is stored. It is recomputed from position on every render.

### Day hues

| Bucket | Hue | Chroma × | |
|---|---|---|---|
| Monday | 22 | 0.88 | clay red |
| Tuesday | 55 | 0.82 | ochre |
| Wednesday | 145 | 0.70 | sage |
| Thursday | 195 | 0.66 | seafoam |
| Friday | 245 | 0.80 | dusty blue |
| Saturday | 295 | 0.78 | muted violet |
| Sunday | 345 | 0.85 | dusty rose |
| Backlog | 35 | — | rendered **neutral** — see below |

The **chroma ×** column is a per-hue scale factor applied to the global chroma
`C`. It is not decoration: OKLCH chroma is not perceptually equal across hues,
and the sRGB gamut ceiling swings from 0.126 (teal) to 0.274 (magenta). A single
global chroma makes some days shout while others go muddy, and at `C = 0.13` it
clipped outright at the old hues 165 and 225. See
[`decisions.md D7`](decisions.md#d7--per-hue-chroma-and-a-tapered-ramp).

The mockup exposes a `rainbow` toggle that collapses every day to hue 250. Keep
it: it is a useful accessibility escape hatch for anyone who finds seven hues
noisy.

### Chroma

One global constant, default **`0.13`**, sensible range `0.04`–`0.18`. Expose it
as a setting. Referred to below as `C`.

The **backlog is neutral**: it uses `C = 0.006` regardless. It is a holding pen,
not a day, and should recede.

---

## 2. The shading formula

Given a task's rank `r` among the **open** tasks in its bucket (0-based) and the
open-task count `n`:

```
Cd = C * chromaScale[bucket]

t = n > 1 ? r / (n - 1) : 0
L  = 0.66 + t * 0.28              // 0.66 at the top → 0.94 at the bottom
Cx = clamp(L,    Cd * (1 - 0.55 * t),  hue)   // taper, then clamp to gamut
Ci = clamp(0.25, Cx * 0.5,             hue)

background = oklch(L     Cx  hue)
foreground = oklch(0.25  Ci  hue)
```

**Chroma tapers with lightness, then is clamped to the gamut.** A constant
chroma cannot survive a rising lightness ramp — the sRGB ceiling collapses as
`L` climbs (hue 22 holds 0.244 at `L 0.60` but only ~0.033 at `L 0.94`), so the
pale end of every warm day clipped and drifted off-hue.

The taper alone is *not* sufficient, and this is worth being precise about: a
0.55 taper still overshot on five of the seven days above `t ≈ 0.75`. And since
`C` is a user setting (0.04–0.18), no fixed taper can be safe at every value.
So `clampChroma()` binary-searches the actual sRGB boundary at each `(L, hue)`
and reduces chroma only as far as genuinely required. Clipping is now
structurally impossible rather than tuned away.

Verified across all 8 buckets at bucket sizes 1–20: **0 gamut clips, worst
contrast 4.96:1.**

**There is no text-colour flip.** The ramp is light end to end, so ink is always
dark. The old `L >= 0.70` threshold has been removed along with the white-text
case — it created a contrast valley (3.27:1) at precisely the crossover point.

Three things to hold on to:

- `n` counts **open tasks only**. Completed tasks are outside the scale entirely.
- A lone task gets `t = 0` — the darkest shade. A single task is the most
  important task in that day.
- The ramp is continuous, not a fixed set of steps. See
  [`decisions.md`](decisions.md#d5--shade-scale) for what happens on very long
  days.

### Completed tasks

Off the scale, muted, still faintly tinted with the day's hue:

```
background = oklch(0.955  C*0.16   hue)     // neutral buckets: 0.004
foreground = oklch(0.63   C*0.24   hue)     // neutral buckets: 0.006
```

Plus `text-decoration: line-through` and `opacity: 0.75` on the title.

---

## 3. Neutrals

| Role | Value |
|---|---|
| Page behind the phone | `oklch(0.93 0.006 95)` |
| App surface | `oklch(0.985 0.004 95)` |
| Expanded section background | `oklch(0.975 0.004 95)` |
| Progress track | `oklch(0.92 0.005 95)` |
| Ring track (review) | `oklch(0.9 0.005 95)` |
| Text — primary | `oklch(0.22 0.01 95)` |
| Text — section heading | `oklch(0.24 0.01 95)` |
| Text — secondary | `oklch(0.55 0.01 95)` |
| Text — tertiary / labels | `oklch(0.6 0.01 95)` |
| Accent (buttons, ring, links) | `oklch(0.55 0.13 250)` |
| Accent hover | `oklch(0.48 0.13 250)` |
| Backlog count emphasis | `oklch(0.5 0.13 40)` |

Note the hue-95 cast across every neutral. They are warm greys, not pure greys.
Keep it — pure `#888` will look wrong next to these.

---

## 4. Type

Two families, and the split between them is meaningful.

**Hanken Grotesk** (400/500/600/700) — all prose and labels.
**JetBrains Mono** (400/500) — *every number the user might compare*: the clock,
percentages, counts, durations. Numbers that line up vertically must be
tabular.

| Element | Size | Weight | Notes |
|---|---|---|---|
| App title | 30px | 700 | `letter-spacing: -0.02em` |
| Week range | 13px | 500 | secondary |
| Week % (header) | 26px | 500 | mono |
| Section label | 16px | 600 | |
| Section sub (`3/5 done`) | 12px | 500 | secondary |
| Task title | 14px | 500 | truncates with ellipsis, single line |
| Duration chip | 11px | 500 | mono |
| Count label | 12px | 500 | mono |
| Uppercase micro-label | 11px | 500 | `letter-spacing: 0.05–0.06em` |
| Review % | 38px | 500 | mono |
| Review stat | 22px | 700 | |

---

## 5. Geometry

| Element | Radius |
|---|---|
| Task card | 11px |
| Section wrapper | 16px |
| Review panel | 20px |
| Add button | 10px |
| Tab container / tab | 11px / 9px |
| Input | 7px |
| Duration chip | 6px |
| Today pill | 5px |
| Checkbox | 50% |

**Spacing**

- Task row: `padding: 9px 11px`, `gap: 10px`
- Between task rows: `5px`
- Section header: `padding: 12px 14px`, `gap: 11px`
- Between sections: `8px`
- Day list horizontal padding: `14px`

**Checkbox** — 21px, `2px` border in the card's foreground colour. When done it
fills with the foreground colour and the check glyph is drawn in the *background*
colour.

**Duration chip** background depends on which side of the contrast flip the card
sits: `rgba(0,0,0,0.06)` on light cards, `rgba(255,255,255,0.20)` on saturated
ones.

---

## 5b. Section colour

Cards are not the only place the day's hue appears. If they were, an empty week
would be entirely grey — and a week starts empty. Each section carries its own
identity:

```
background = oklch(0.975  Cd*0.16  hue)   // pale wash behind the section
accent     = oklch(0.62   Cd*0.95  hue)   // rail, Today pill, ring, + button
label      = oklch(0.38   Cd*0.55  hue)   // section heading ink
```

The accent also replaces the global blue on the section's `+` button. A 3px
rail sits left of the chevron so the hue is present even when the section is
collapsed and holds nothing.

---

## 6. Today

Two markers, both needed — colour alone is not an accessible signal:

- A 2px ring on the section wrapper: `box-shadow: 0 0 0 2px <section accent>`
- A "Today" pill next to the section label, in the day's hue

Today's section is the only one expanded on first load.

---

## 7. Collapsed sections

A collapsed day shows a **mini bar chart** of its open tasks — up to six bars,
6px wide, descending in height (`14px`, `13px`, `12px`…), each painted with that
task's shade.

It is a sparkline of the day's weight: how much is left, and how heavy the top of
it is, without expanding anything.

---

## 8. Motion

Restrained. Three transitions, no more.

| What | Value |
|---|---|
| Task appearing | `orgo-in 0.18s ease` — fade + 4px rise |
| Chevron rotation | `transform 0.2s` |
| Review progress bar | `width 0.3s` |

Scrollbars are hidden (`::-webkit-scrollbar { width: 0 }`). Momentum scrolling
carries the affordance on touch.

Respect `prefers-reduced-motion` — this is not in the mockup and needs adding.

---

## 9. Known gaps

The mockup is a desktop-browser artefact and does not cover:

- **Touch drag** — it uses HTML5 drag events, which do not work on a phone. The
  real app needs long-press-to-lift and edge auto-scroll.
- **Dark mode** — no dark palette exists. The formula inverts cleanly in
  principle (`L = 0.45 − t * 0.20` or similar), but it has not been designed or
  tested.
- ~~**Contrast verification**~~ — done. Measured by calling the shipped
  `openShade()` across all 8 buckets at bucket sizes 1–20: **0 gamut clips,
  worst pair 4.96:1**, clearing AA. The old ramp failed — every top card sat at
  3.6–4.1:1, and the flip point dipped to 3.27:1. Re-run the check if any ramp
  constant moves; the margin over 4.5 is thin.
- **Empty states** beyond the word "empty" in a section subtitle.
- **Reduced motion.**
