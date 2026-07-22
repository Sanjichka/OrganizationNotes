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

## D2 — Carry-over model and trigger

**One weekly sweep to the backlog, triggered client-side on the first open of a
new week.** Not a nightly cascade, and not a scheduled Supabase function.

*Model (revised by the project owner, 2026-07-21).* The v0.1 draft carried each
day's leftovers to the *next day* and only emptied Sunday into the backlog. The
owner chose a simpler shape: at week's end, **everything still open across all
seven days lands in the backlog** in one move, and the new week starts with empty
days. A day you skip stays quietly on its day until the week turns, rather than
climbing through the rest of the week. This trades the daily escalation pressure
(see [D3](#d3--carry-over-placement)) for a clean weekly reset and a single, easy
mental model: *the backlog is everything you didn't get to.*

*Trigger.* The app has exactly one user. A midnight cron would serve people who
need their data correct while they sleep — nobody is looking. What matters is that
the board is correct *the moment the app is opened*, and a client-side check
guarantees that by construction.

It also sidesteps timezones. "End of week" means the user's local week; a server
function would need the user's timezone stored, kept current, and correct across
DST. The client already knows, so it passes its local `today` into the RPC.

The requirement this creates is [idempotency](data-model.md#4-carry-over) —
guarded by `user_state.last_rollover_on`, applied in one transaction
(`rollover_week`, `supabase/migrations/0004`).

Revisit if the app becomes multi-user or multi-device-with-widgets.

---

## D3 — Carry-over placement

**Carried tasks land at the TOP of the backlog**, above whatever is already there,
with their relative order preserved (day order, then position within the day).

Now that carry-over is a [weekly sweep](#d2--carry-over-model-and-trigger) rather
than a daily cascade, this is the whole of the placement question — there is no
"next day" to place into. Top-of-backlog keeps the freshest leftovers in view when
you sit down to plan the new week, so re-scheduling them onto a day is a short
drag, not a scroll to the bottom of a growing pile.

*Superseded reasoning.* The v0.1 daily model placed carries at the top of the
*next day* so an avoided task climbed and darkened each night — "the app applies
pressure exactly where pressure is due." The weekly model gives that pressure up
on purpose: nothing escalates mid-week, and everything unfinished simply pools in
the backlog at week's end. If daily escalation is ever missed, this is the
decision to reopen.

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

**Amendment (input UX):** the *entry* is now preset chips — 15m / 30m / 1h / 2h,
plus a custom minutes field — rather than free-text parsing. On a phone tapping a
preset beats typing `1h30m`, and the custom field keeps the long tail reachable.
The storage is unchanged (minutes in `duration_min`) and the read-side chip is
unchanged; only how the number is captured differs. The free-text parser was
never built, so nothing regressed.

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

## D8 — Top nav, not bottom; profile behind the avatar

**The Week / Review switch is a segmented toggle inside the header, and the
whole app has no fixed bottom bar.** This follows the mockup and reverses the
earlier bottom-nav experiment (commits `962a2c7`, `91e80ea`).

The header now carries everything persistent: the avatar, the user's name and
the week range, this week's completion figure, and the view switch. It is
sticky, so both the avatar and the toggle stay reachable as the list scrolls —
which was the one thing a bottom bar bought us. A bottom bar also fought the
add-task and rename sheets for the same edge of a phone screen; a top toggle
does not.

**Profile is an overlay, not a third tab.** Tapping the avatar opens it over
whichever view you were on; closing returns you there. It is not part of the
Week/Review toggle because it is a mode you enter and leave, not a peer view you
switch between.

Name and email are stored on the Supabase auth user (`user_metadata.full_name`
plus `email`) and written with `updateUser` — no separate profile table, since
these are exactly the fields auth already owns. The **photo goes to a public
`avatars` Storage bucket** (migration `0002`), and only its public URL is kept on
the user. Holding the image itself as a base64 data URL in `user_metadata` was
tried first and does not work — it inflates the access-token JWT and GoTrue
rejects anything past a small ceiling, so uploads appeared to succeed but never
persisted. The password change re-authenticates with the current password first,
because `updateUser({ password })` does not verify it on its own.

Identity edits **auto-save**, no Save button: the photo uploads the moment it is
picked, and the name is written on blur — so leaving the field, including by
pressing Back, stores it. Email is shown read-only here; it is not changed from
this screen. The password form keeps its own explicit button — it is a
different, independent action with its own validation and re-auth step.

---

## D9 — Subtasks are a checklist, not nested tasks

*Accepted.* Moves subtasks in-scope, reversing the v1 "Out" line in
[`spec.md`](spec.md). Confirmed with the project owner along with the two
interaction choices below.

A subtask is a **lightweight checklist item** under a task — `title`, `done`,
`position`, nothing else. It lives in its own [`subtasks`](data-model.md#6-subtasks)
table, keyed to its parent by `task_id` with `on delete cascade`.

**Why not nested tasks (a `parent_id` on `tasks`).** The whole model rests on
*bucket = day* and *position = priority within a bucket*, and shading is derived
from a task's rank among the open tasks in its bucket. A subtask that was a full
task would need its own bucket and date — and then either it participates in the
day's shading ramp (nonsense: it isn't a peer of the day's tasks) or it doesn't
(a special case threaded through every render). Carry-over would have to decide
whether a child moves with its parent or on its own. Each of those is a fresh
exception to an invariant. A child table keyed by `task_id` has **none** of them:
a subtask has no bucket, no date, no shading, and no independent carry-over. It
follows its parent because it points at the parent, not at a day. Every invariant
in [`CLAUDE.md`](../CLAUDE.md) is untouched.

**No `completed_at` on subtasks.** Tasks carry one because the weekly review is
built on it. Subtasks never feed the review — a plain `done` boolean is the whole
requirement. If review-of-subtasks is ever wanted, that is a migration, not a
correction.

**Inline expand, not a detail sheet.** A progress chip (`2/5`) and a caret on the
card unfold the checklist in place. This matches D4's "the week is visible as a
whole" ethos — the sheet would hide subtask state behind a tap and repurpose the
existing tap-to-rename gesture. The checklist renders inside the sortable wrapper
but *outside* the draggable card row, so parent drag is unaffected and taps in
the list never lift a card.

**Auto-complete is symmetric.** Checking the last open box completes the parent;
unchecking a box on a completed parent reopens it; adding a box to a completed
parent reopens it. All three go through the same `setDone` path a manual toggle
uses, so the parent drops to / rises from the done section identically. Deleting
a subtask deliberately does *not* auto-complete — "delete finished my task" is a
worse surprise than a box left unchecked. A task with zero subtasks has no auto
behaviour at all.

**Deferred, designed-for:** subtask drag-reordering. `position` is fractional and
the reorder helpers are shared, so it is a UI addition, not a migration.

---

## D10 — "When": a clock time, not a date

**An optional time of day, stored as `time`, shown as a second card chip.** It
sits beside the duration chip: "when I plan to start" next to "how long it takes".

It is deliberately *not* a `timestamptz` and carries no date. A task already has a
day — its bucket — and a backlog task has no day at all; a full instant would
duplicate the first and be meaningless for the second. So the column is `time`
("14:30"), captured with a native `<input type="time">` and stored as `HH:MM`.

It is display metadata, nothing more. It does **not** enter the canonical sort
(tasks stay ordered by hand-set `position`, not by clock — an 8am task can sit
below a 9am one if that is where you dragged it), it does not shade anything, and
carry-over ignores it. Adding it was a column plus a chip, touching no invariant —
by design, the same shape as `duration_min`.

Both fields are optional and independent: a task may have a time, a duration,
both, or neither.

---

## D11 — Subtasks gain task parity and drag conversion

*Accepted.* Revises D9 at the project owner's request. A subtask stops being a
"lightweight checklist item" and becomes a **nested task, capped at one level**.
Two things change; the load-bearing invariants do not.

**Subtasks can be dragged in and out.** Dropping a task onto the **central band**
of another card nests it as that card's subtask (dropping near a card's edge, or
on a day, still reorders/moves). Dragging a subtask onto a day promotes it back to
a task; onto another card's band it re-parents; over a sibling it reorders. The
edge-vs-centre split is the whole disambiguation — see
[`0006`](../supabase/migrations/0006_subtask_parity.sql) and `Board.tsx`
(`nestTarget`). For any of this to fire, the drag's `over` must resolve to a
sibling **card**, not the day it sits in — so `Board.tsx` sets a custom
`collisionDetection` (`nestAwareCollision`) that prefers the card/subtask under
the pointer over the section-body droppable. Without it the default
intersection-ratio collision lets the full-column day rect out-compete a single
card, and same-day nesting never triggers (no ring). Do not drop it.

**Subtasks carry the same fields a task does.** So the round-trip is lossless,
`subtasks` gains `duration_min`, `start_time` and `completed_at`, mirroring
`tasks` exactly, and both add/edit go through the **same `TaskSheet`** (tinted by
the parent's bucket). This reverses the "No `duration_min` / `completed_at`"
bullets D9 wrote into [`data-model.md §6`](data-model.md#6-subtasks).

**What still holds.** A subtask still has **no bucket, date or shading** — it
follows its parent by `task_id`, so carry-over and the colour ramp are untouched.
The weekly review stays **tasks-only**; `completed_at` on a subtask exists solely
so a promoted subtask keeps its timestamp and so the done-toggle mirrors a task's.
Subtasks are still shown in plain `position asc` (no done/`completed_at` split).

**Guards (the drag refuses; the card snaps back, no error).** A **completed** task
cannot nest — that would move a completed task and drop the timestamp the review
runs on ("completed tasks never move"); uncomplete it first. A task that **already
has subtasks** cannot nest either — one level only, no grandchildren.

---

## Still genuinely open

Not blocking, but undecided:

- **Review metrics.** The mockup's base charts are built — completion ring,
  done/planned/backlog counts, per-day bars, all derived from the live task rows.
  What's still open is whether "carried over" and "dropped to backlog" deserve
  first-class numbers, and whether the figures should span history rather than
  just this week. The data supports computing both retroactively, so this can
  wait until the review view has been used a few times.
- **Dark mode.** No palette designed. See
  [`design-system.md`](design-system.md#9-known-gaps).
- **Historical weeks.** The model retains everything; there is no navigation to it.
