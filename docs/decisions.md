# Decisions

The six open questions from the v0.1 spec draft, answered.

**D1 is confirmed by the project owner. D2–D6 are *proposed* — reasoned defaults
so work can start, not settled law.** Overrule any of them; if you do, update
this file and say why. A reversed decision with reasoning is worth more than a
decision nobody can reconstruct.

---

## D1 — App shape

**Installable PWA.** Confirmed.

React + TypeScript + Vite, `vite-plugin-pwa` for the service worker and install
manifest, Supabase JS client for data.

One codebase, no app-store review, no native build toolchain, and installs to the
home screen — which is what "downloadable" actually needed to mean here. Supabase
has first-class web support.

The cost is real and worth naming:

- **Touch drag needs a library.** HTML5 drag-and-drop is mouse-only. `@dnd-kit`
  with its touch sensor gives long-press-to-lift and edge auto-scroll.
- **No background execution.** A PWA cannot wake at midnight. This is why D2
  lands where it does.
- **iOS PWA install is awkward** — Share → Add to Home Screen, and no prompt is
  available. Worth a one-time hint in the UI.

Revisit if push notifications or true background carry-over become requirements.
Neither is in v1.

---

## D2 — Carry-over trigger

**Client-side, on first open of a new day.** Not a scheduled Supabase function.

The app has exactly one user. A midnight cron exists to serve people who need
their data correct while they sleep — nobody is looking. What matters is that the
board is correct *the moment the app is opened*, and a client-side check
guarantees that by construction.

It also sidesteps timezones. "End of day" means the user's local day; a server
function would need the user's timezone stored, kept current, and correct across
DST. The client already knows.

The requirement this creates is [idempotency](data-model.md#4-carry-over) —
guarded by `user_state.last_rollover_on`, applied in one transaction.

Revisit if the app becomes multi-user or multi-device-with-widgets.

---

## D3 — Carry-over placement

**Carried tasks land at the TOP of the new day.**

This reverses the v0.1 draft's leaning, so here is the argument.

Bottom placement has a compounding failure. A task carried to the bottom sits
below everything newly planned. Tomorrow it carries again — to the bottom again,
now below yet another day's plans. Since shading is derived from position, it also
fades a little lighter each night. **The longer you avoid something, the quieter
the app gets about it.** That is precisely backwards.

Top placement inverts that. An avoided task climbs and darkens until it is the
first thing visible. The app applies pressure exactly where pressure is due.

Relative order among the carried group is preserved, so yesterday's ranking
survives intact — it simply sits above today's new work.

The counter-argument is fair: a genuinely dead task now dominates the day until
it is dealt with. But the remedy is one drag to the backlog, and being forced to
make that choice is the feature.

---

## D4 — Layout

**Vertical scroll through collapsible day sections.** Not a swipe carousel.

Effectively settled by the mockup, but the reasoning holds independently:

- The week is visible as a whole. A carousel shows one day and hides the other
  six — you cannot see where the weight sits.
- **Drag between days requires it.** In a carousel, dragging Tuesday's task to
  Friday means holding a lift while swiping three screens. In a vertical list it
  is a drag with edge auto-scroll.
- Collapsed sections stay informative via the mini bar chart, so the overview
  costs almost no vertical space.

Today expands on load; the rest start collapsed.

---

## D5 — Shade scale

**Continuous gradient, with a floor on the step size.**

The formula (`L = 0.60 + t * 0.28`) spreads however many tasks exist across the
full range. With 4 tasks the steps are ~0.093 in lightness — clearly distinct.
With 20 they are ~0.015, which is invisible, and the gradient degrades into a
smooth wash where no card looks meaningfully more urgent than its neighbour.

So: keep the continuous ramp, but **cap the effective denominator at 8**.

```
t = min(r, 7) / 7
```

The top eight tasks span the full dark-to-light range; everything below the
eighth renders at the lightest shade. Days of realistic length are unaffected —
this only engages once a day is overloaded, and at that point "everything past
the eighth item is background noise" is an honest thing for the UI to say.

Fixed 5-step scales were the alternative and are worse: they waste the range on
short days, which is the common case.

---

## D6 — Tags & duration in the v1 UI

**Duration: in. Tags: out.** Both columns exist in the schema regardless.

Duration is already designed and built in the mockup — the mono chip on the right
of each card, with a `showTimes` toggle. It is a free-text field, not a picker:
the user types `45m` or `1h30m` and it is stored as minutes. Cheap, and it makes
a day's load legible at a glance.

Tags are not free. A tag system needs a vocabulary, a colour or shape to render
it, and filtering to be worth having — and colour is already fully spent
encoding day and priority. There is nowhere left to put a tag that would not
compete with the thing that makes the app work.

The column stays so that adding tags later is a UI change and not a migration.

---

## D7 — Per-hue chroma and a tapered ramp

*Accepted.* Supersedes the original "one global chroma, one constant across the
ramp" reading of the colour system.

The formula is still one formula. It is now parameterised by `(hue, chromaScale)`
rather than by hue alone, and chroma varies along the ramp rather than staying
flat. Three measured problems forced this:

**The old ramp failed WCAG AA.** Task titles are 14px/500 — normal text, so the
bar is 4.5:1. Every day's top card measured between 3.59:1 and 4.09:1. The
`L >= 0.70` text flip made it worse rather than better: right at the crossover
the ramp dipped to 3.27:1, because a mid-lightness background has poor contrast
with *both* near-white and the old `L 0.32` ink.

**Constant chroma across a rising lightness ramp is not achievable in sRGB.** The
gamut ceiling collapses as lightness climbs — hue 22 holds chroma 0.244 at
`L 0.60` but only 0.064 at `L 0.88`. The old ramp asked for 0.13 the whole way,
so the pale end of every warm day was silently clipped, which both flattens the
gradient and drags the rendered hue away from the intended one.

**A single global chroma is not perceptually even.** Max chroma at `L 0.60`
ranges from 0.126 at hue 165 to 0.274 at hue 330. At `C = 0.13` teal and blue
clipped while magenta and violet had headroom to spare — so days that were
meant to be siblings did not read as siblings.

The fix: scale chroma per hue, taper it across the ramp, **clamp the result to
the sRGB boundary at render time**, lift the ramp into the light half
(`L 0.66 → 0.94`), and drop the text flip entirely so ink is always dark. Worst
pair on any day is now 4.96:1, with zero clipping.

The clamp is the load-bearing part. A taper alone was tried first and was not
enough — at 0.55 it still overshot on five of seven days past `t ≈ 0.75`. More
importantly, `C` is a user-facing setting spanning 0.04–0.18, so *no* fixed
taper can be safe across its range. `clampChroma()` binary-searches the gamut
boundary per `(L, hue)`, which makes clipping structurally impossible instead of
tuned away. Cost is ~24 iterations of a cubic per colour, which is nothing at
these list sizes.

The trade is that cards are tints rather than saturated blocks — the top card is
lighter than it was. Priority is still legible, because chroma now varies along
the ramp as well as lightness: the top card is both deeper *and* more saturated,
where before it was only darker.

*Also decided here:* sections carry the day's hue themselves — wash, rail, label,
`+` button. Previously colour lived only on cards, so an empty week rendered
entirely grey, and a week always starts empty.

---

## Still genuinely open

Not blocking, but undecided:

- **Review metrics.** The mockup shows completion percentage, done/planned/backlog
  counts, and per-day bars. Whether "carried over" and "dropped to backlog"
  deserve first-class numbers is unanswered. The data supports computing them
  retroactively, so this can wait until the review view has been used a few times.
- **Dark mode.** No palette designed. See
  [`design-system.md`](design-system.md#9-known-gaps).
- **Historical weeks.** The model retains everything; there is no navigation to it.
