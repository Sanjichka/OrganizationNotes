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

**A nightly cascade: Mon–Sat carry into the next day, Sunday empties into the
backlog.** Triggered client-side on first open, once per day. Not a scheduled
Supabase function.

*Model (revised by the project owner twice; current since 2026-07-23).* The v0.1
draft had this shape, the 2026-07-21 revision replaced it with one weekly sweep
to the backlog, and the owner has now reverted to the daily cascade. The weekly
sweep was simpler to state but it deferred everything: a day you skipped on
Monday sat untouched all week, and nothing applied pressure until Sunday night,
at which point five days of neglect arrived in the backlog at once. The cascade
puts the leftovers in front of you the next morning instead, which is the whole
point of a daily planner. See [D3](#d3--carry-over-placement) for what that
escalation buys.

The Sunday terminus is unchanged in spirit from both models: there is no eighth
day, so Sunday's leftovers pool in the backlog and the new week starts clean.

*Trigger.* The app has exactly one user. A midnight cron would serve people who
need their data correct while they sleep — nobody is looking. What matters is that
the board is correct *the moment the app is opened*, and a client-side check
guarantees that by construction.

It also sidesteps timezones. "End of day" means the user's local midnight; a
server function would need the user's timezone stored, kept current, and correct
across DST. The client already knows, so it passes its local `today` into the RPC.

The requirement this creates is [idempotency](data-model.md#4-carry-over) —
guarded by `user_state.last_rollover_on`, applied in one transaction
(`rollover_days`, `supabase/migrations/0007`, which supersedes `rollover_week`).
Because the trigger is "on open" rather than "at midnight", the RPC replays every
boundary missed since the last run: open the app on Thursday having last opened
it on Monday and Monday's leftovers cascade through Tuesday and Wednesday to
land on Thursday, exactly as three nightly runs would have left them.

**Past a week away, the cascade stops pretending.** Buckets are weekday-keyed,
not date-keyed, so after seven days the `mon` bucket cannot say whether it means
this Monday or one five weeks ago, and a day-by-day replay would be false
precision. A gap of seven days or more therefore flushes every open day task
straight to the backlog — which is the cascade's fixed point anyway, since any
7-day span crosses a Sunday.

Revisit if the app becomes multi-user or multi-device-with-widgets.

---

## D3 — Carry-over placement

**Carried tasks land at the TOP of their destination**, above whatever is already
there, with their relative order preserved.

For a nightly carry that means the top of the *next day*, so an avoided task
climbs and darkens each night — the app applies pressure exactly where pressure
is due. For Sunday's carry, and for the week-away flush, the destination is the
backlog, and top-of-backlog keeps the freshest leftovers in view when you sit
down to re-plan rather than buried under a growing pile.

*History.* The brief weekly-sweep model (2026-07-21 to 2026-07-23) gave the daily
escalation up deliberately, on the grounds that nothing should escalate mid-week.
In use it read as the board going slack: leftovers neither confronted you nor
went anywhere until Sunday. Escalation is back, and it is the reason the daily
model is worth its extra machinery.

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
plus a custom picker — rather than free-text parsing. On a phone tapping a preset
beats typing `1h30m`, and the custom picker keeps the long tail reachable. The
storage is unchanged (minutes in `duration_min`) and the read-side chip is
unchanged; only how the number is captured differs. The free-text parser was
never built, so nothing regressed.

**Amendment 2 (custom is hours + minutes, 2026-07-24).** The custom field asked
for a raw minute count, which made the user do the arithmetic — four and a half
hours is not a number anyone holds as `270`. It is now two `<select>`s, hours
beside minutes, in the units the duration is actually thought in.

They stay *native* selects on purpose: iOS renders a `<select>` as a scroll
wheel, so the phone-first picker the UI wants costs no code and no library, and
it stays accessible and keyboard-usable on desktop. Hours stop at 12 — beyond
that it is a day, not a task — and minutes step by 5. An existing off-step value
keeps its own minute option in the list, so opening the sheet on an old 47m task
cannot silently round it to 45. `0h 00m` stores `null`, which is the same state
as never having set a duration.

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
Subtasks are still shown in plain `position asc` (no done/`completed_at` split).
(The "review stays tasks-only" line here is superseded by [D12](#d12--the-review-weights-tasks-by-their-subtasks);
`completed_at` on a subtask still earns its keep for the promotion round-trip.)

**Guards (the drag refuses; the card snaps back, no error).** A **completed** task
cannot nest — that would move a completed task and drop the timestamp the review
runs on ("completed tasks never move"); uncomplete it first. A task that **already
has subtasks** cannot nest either — one level only, no grandchildren.

---

## D12 — The review counts subtasks as flat units

*Accepted.* Revises the "review stays tasks-only" line in
[D11](#d11--subtasks-gain-task-parity-and-drag-conversion) at the project owner's
request. Subtasks now feed the weekly completion figure as **units in their own
right**, each weighted the same as a standalone task.

We briefly tried a *weighted* model (each top-level task an equal slice, subtasks
splitting their parent's slice — so three tasks, one with three subtasks, read
33% / 33% / 11%·11%·11%). On real data it surprised: a day of one task at 1/3 of
its checklist barely moved the needle, and the ring's 83% didn't square with the
plain "6 of 8 boxes ticked" the owner was counting in their head. So it was
dropped in favour of the simpler unit model.

**Every subtask is one unit; a childless task is one unit.** The figure is just
`doneUnits / totalUnits`. Three tasks, one carrying three subtasks, is five units,
and completing a whole task or ticking one subtask move the needle equally
(6/8 = 75%, not a weighted 83%).

**This stays consistent with auto-complete.** All boxes done ⇒ parent done, so a
fully-checked task contributes `n done / n total` either way — a task with
subtasks is simply represented by its boxes, never double-counted alongside them.

**One formula, everywhere.** `src/lib/completion.ts` is canonical: `taskUnits` /
`tallyUnits`, and `weekReview` on top of them. The header percentage (`Board.tsx`)
and the whole Review screen (`Stats.tsx` — ring, per-day bars, **and** the
`done / planned / backlog` figures and per-day `done/total` labels) all read
`weekReview`, so no two numbers on the screen tell different stories. Units are
computed at render time from the same `tasks` + `subtasks` rows.

*(Amended by [D13](#d13--the-review-counts-by-plan-not-by-bucket): `weekReview`
groups those units by `planned_date` rather than by bucket, and applies any
manual correction to the total. The unit model itself is unchanged.)*

**Note the Week board still labels day headers by task** (`0/1 done`), not by unit
— that header answers "how many of today's tasks are closed out", a different
question from the review's progress. Only the review screen and the header
percentage count units.

---

## D13 — The review counts by plan, not by bucket

*Accepted (project owner, 2026-07-23).* Reported as a bug: "Wednesday had 3 of 5
done, Thursday was empty, and after midnight Wednesday reads 3/3 — which is not
true, it is 3 of 5."

It was true. The review derived each day's figure from the tasks **currently in
that day's bucket**, so the moment [carry-over](#d2--carry-over-model-and-trigger)
moved Wednesday's two open tasks to Thursday, Wednesday's denominator left with
them. "Completed tasks never move" preserved the *numerator* — that is what
`completed_at` is for — but nothing preserved the plan. Every day converged on
100% by attrition, and the ring flattered you in exact proportion to how much you
had skipped.

**Every task records the day it was planned for.** `tasks.planned_date`, set on
insert from `date`, and the review counts by it. Carry-over **never** rewrites it;
a deliberate user move does, because dragging a task to Friday *is* replanning it
for Friday. That one asymmetry is the whole mechanism.

The consequence worth stating plainly: a carried task counts against the day it
was **planned** for, not the day it now sits on. Wednesday reads 3/5 forever, and
Thursday is not inflated by work it inherited. Thursday's figure answers "how
much of what I planned for Thursday did I do", which is the only question that
means anything.

**The split, which is the same problem one level down.** A part-done checklist
carried whole would drag its ticked boxes off the day that earned them. So it
divides: the done subtasks stay with the original — which auto-completes, since
every box remaining on it is ticked, exactly the rule [D9](#d9--subtasks-are-a-checklist-not-nested-tasks)
already applies when you tick the last box by hand — and the open ones move to a
new task of the same name. Being done, the remnant can never move again, which is
precisely what pins the evidence to the day. The clone **inherits the original's
`planned_date`** rather than defaulting to the day it lands in, for the reason
above: those boxes were planned for Wednesday.

**Only the denominator is editable.** The pencil on a day's row corrects its
planned total and nothing else. The done count stays derived from `completed_at`,
so the review can be corrected when the derived number is genuinely wrong — a
task added Thursday that you only ever intended for Thursday, a plan you abandoned
on purpose — but never flattered. An override lives in `day_plan_override`, keyed
by plan date; deleting the row restores the derived figure. A corrected total is
marked in the UI (dotted underline) so it never passes for derived.

**And only while the week is open.** *(Added 2026-07-24, project owner.)* The
pencil belongs to the week you are living in. Once a week has closed, its
figures are read-only — no pencil, and the override write is refused in the data
layer, not merely hidden. Correcting a week is part of running it: "that day's
plan was really four" is something you know on Thursday, not something you
should be able to decide in hindsight about a week you have already been
measured against. A history you can edit is not a history. This is normally
invisible, since the weekly review only ever renders the current week; it shows
up in the one case that can render a stale one, a session left open across
Sunday midnight, and it is checked at the write rather than at the view for
exactly that reason.

**The Overall review is read-only, entirely.** It reads the same rows, so it
moves as the current week moves, but nothing on it can be changed from the UI.
There is nothing there to correct that isn't already a consequence of the weeks
underneath it — an all-time figure that could be edited directly would be a
second, disagreeing source of truth for numbers the weekly review already owns.
Corrections happen in one place, on an open week, and everything downstream
follows.

**Why a column and not a snapshot.** The alternative was writing each day's tally
into a stats table at carry-over time. That stores a number the rows already
imply, goes stale the moment anything is edited, and needs a second code path for
the current (un-snapshotted) week. Provenance keeps the project's "derived, never
stored" ethos: the figure is still computed at render time, from a column that
records a *fact about the task* rather than a cached answer. The one genuinely
un-derivable thing — a human saying "that day's plan was really four" — is the
only thing that gets stored.

**The known gap.** Tasks already swept to the backlog by the old weekly rollover
have no recoverable plan date and are backfilled null, so they count toward no
day. That history is gone; inventing a date for it would be worse than the gap.

---

## D14 — Next week is a filter, not a place

*Accepted (project owner, 2026-07-23).* Asked for: a second planning board,
"Next week", sitting beside Week. When the current week ends it becomes the Week,
its predecessor's unfinished tasks go to the backlog, and Next week comes up
empty.

The obvious reading is that the week turning over is a **migration** — copy or
move next week's rows onto the current board, then clear the staging area. That
would be a second carry-over: a bulk write, on a schedule, needing its own
idempotency guard, its own failure mode, and its own answer to "what if it runs
while you are mid-drag". [D2](#d2--carry-over-model-and-trigger) already
establishes how much care one of those costs.

It is unnecessary. **A day-bucket task already carries a real calendar date** —
not a weekday name, an actual `date`, and the schema's `backlog_has_no_date`
check makes that an invariant rather than a convention. So the date alone says
which week a task was planned into. Week and Next week are two filters over one
table, and the boundary is not an event at all: the same rows simply start
matching the other filter when the calendar moves. Nothing is written, so nothing
can half-happen, so there is nothing to make idempotent.

The three behaviours asked for all fall out:

- **Next week becomes the Week.** Its tasks' dates are now this week's dates.
- **Next week comes up empty.** Nothing is dated a fortnight out, because the UI
  offers nowhere to put it.
- **Unfinished work goes to the backlog.** This is not new behaviour either — it
  is the ordinary Sunday cascade step, which has emptied Sunday into the backlog
  since 0007. A week's leftovers reach Sunday by cascading nightly, and go over
  the edge from there.

**What did have to change: carry-over stops keying off the bucket.** `carry_bucket`
moved every open task in bucket `sun`; with two weeks on the board that is now two
different Sundays, and next week's plan would be swept into the backlog the moment
this week ended. `carry_day` keys off the source **date**, which is unambiguous —
and therefore cannot touch a future-dated task at all. Next week is protected by
arithmetic rather than by a special case.

That change earns something else. Being date-keyed, the cascade can no longer
revisit a day it did not cross, so a task stranded on a stale date — left by the
old weekly sweep, or dragged onto a day that has already passed — would sit there
forever. So the replay is now followed by a sweep: **nothing open may be left on a
day that has passed.** After a normal replay it finds nothing. It subsumes the old
"away seven days" branch, which was the same operation with a different trigger.

**The board shows a week, not a bucket.** Filtering by date has a consequence
worth stating: completed tasks from previous weeks no longer appear on the board.
They were showing up before — a done card from three weeks ago sat in Wednesday
forever, because completed tasks never move and nothing filtered them out. They
are still counted, by `planned_date`, wherever the review looks for them
([D13](#d13--the-review-counts-by-plan-not-by-bucket)). The one exception is an
**open** task dated outside both weeks: carry-over has failed it, so the board
shows it on the current week rather than letting it become invisible.

**Two reviews, because they answer different questions.** "Weekly review" keeps
its current scope — this week, by plan date. "Overall review" covers everything on
record. It ships blank: `planned_date` and `completed_at` already hold the entire
history, so it needs no new data, only a decision about what an all-time figure
should say — see *Still genuinely open* below, which has been asking exactly that.
An empty page is more honest than a number nobody has defined.

**Why not more than two weeks.** Two is what a weekly planner needs: somewhere to
put a thing that is not for this week. A third would want week navigation, which
[D1](#d1--app-shape) rules out, and the filter model would carry it for free
anyway if that ever changes.

---

## Still genuinely open

Not blocking, but undecided:

- **What the Overall review says.** The screen exists and is blank
  ([D14](#d14--next-week-is-a-filter-not-a-place)). The data is all there —
  `planned_date` and `completed_at` cover every week on record — but an all-time
  completion percentage is a weak answer: it converges and stops moving. Likely
  more useful: a trend across weeks, a best/worst week, a streak, which days of
  the week you actually deliver on. Also unresolved is where history *starts*,
  given the null-`planned_date` gap D13 records.
- **Review metrics.** The mockup's base charts are built — completion ring,
  done/planned/backlog counts, per-day bars, all derived from the live task rows.
  What's still open is whether "carried over" and "dropped to backlog" deserve
  first-class numbers. The data supports computing them retroactively, so this can
  wait until the review view has been used a few times.
- **Dark mode.** No palette designed. See
  [`design-system.md`](design-system.md#9-known-gaps).
- **Historical weeks.** The model retains everything; there is no navigation to it.
