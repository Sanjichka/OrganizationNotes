# CLAUDE.md

Working context for AI assistants. Keep it short and current — if it drifts from
reality it does damage.

## What this is

Orgo: a phone-only weekly task planner PWA. Seven fixed days (Mon–Sun) plus a
backlog, for this week and next. Priority is vertical position; card colour is
derived from it.

The project is scaffolded: Vite + React app in [`src/`](src/), Supabase schema in
[`supabase/`](supabase/). The board, shading, drag-and-drop, and auth are in
place. Supabase credentials are required to see any data — an unconfigured
checkout renders an empty week.

## Read before working

| Question | File |
|---|---|
| What should it do? | [`docs/spec.md`](docs/spec.md) |
| How is data shaped? | [`docs/data-model.md`](docs/data-model.md) |
| What should it look like? | [`docs/design-system.md`](docs/design-system.md) |
| Why is it like that? | [`docs/decisions.md`](docs/decisions.md) |
| The actual design | [`design/Orgo.dc.html`](design/Orgo.dc.html) |

## Stack

React 18 + TypeScript, Vite, `vite-plugin-pwa`, `@dnd-kit`, Supabase.

## Invariants — do not break these without saying so

**Shading is derived, never stored.** Computed at render time from a task's rank
among the *open* tasks in its bucket. No `color` or `priority` column exists, and
adding one is a design regression.

**`position` is fractional, not an index.** Moving a task writes one row. Never
renumber a whole bucket on a reorder — only on the rare precision-collapse
rebalance.

**Completed tasks never move.** Not on carry-over, not on reorder. Moving a
completed task destroys the review's evidence.

**The review counts by `planned_date`, never by `bucket`.** A task's bucket is
where it is *now*; `planned_date` is the day it was planned for. Carry-over must
never rewrite it — a deliberate user move must. Counting by bucket is the bug
this column exists to fix: Wednesday reads 3/3 the morning after being 3 of 5.
See [`decisions.md D13`](docs/decisions.md#d13--the-review-counts-by-plan-not-by-bucket).

**Carry-over is idempotent.** Guarded by `user_state.last_rollover_on`, applied in
one transaction. It will get run twice; that must be a no-op.

**Which week a task belongs to is its `date`, not stored state.** Week and Next
week are two filters over one table. The week turning over writes *nothing* — the
same rows start matching the other filter. Adding a column, a flag, or a
promote-next-week job undoes the whole design; see
[`decisions.md D14`](docs/decisions.md#d14--next-week-is-a-filter-not-a-place).

**Carry-over keys off the source date, never the bucket.** Bucket `sun` names two
different Sundays now. `carry_bucket` is gone for exactly that reason — a
bucket-keyed step would sweep next week's plan into the backlog.

**A part-done checklist splits on carry-over, it does not move.** Ticked subtasks
stay on the day that earned them under a now-completed parent; unticked ones go
forward under a clone that inherits the original's `planned_date`. Carrying the
whole row would drag the evidence off the day.

**One canonical sort:** `done asc, completed_at asc nulls first, position asc`.
Don't re-sort ad hoc in components.

**Offline is read-only.** No write queue, no optimistic sync. This is deliberate —
see [`data-model.md §5`](docs/data-model.md#5-offline).

## Gotchas

**Do not copy the mockup's drag implementation.** `design/Orgo.dc.html` uses HTML5
drag events because it runs in a desktop browser. Those do nothing on a phone.
The app needs `@dnd-kit`'s touch sensor — long-press to lift, edge auto-scroll.

**Colour is OKLCH and stays OKLCH.** The entire system is one formula
parameterised by hue *and a per-hue chroma scale*. Converting to hex breaks it.
Chroma tapers as lightness rises — do not flatten it back to a constant, and do
not reintroduce a light/dark text flip. Both were measured failures; see
[`decisions.md D7`](docs/decisions.md#d7--per-hue-chroma-and-a-tapered-ramp).

**Neutrals are warm (hue 95), not grey.** `#888` will look wrong next to them.

**The mockup is a mockup.** Its `Component` class is illustrative, not code to
port. It holds state in memory with no persistence, dates, or auth.

## Conventions

- Anything in `docs/decisions.md` marked *proposed* can be challenged — but
  update that file with the reasoning rather than silently diverging.
- New non-obvious product decisions go in `docs/decisions.md`, not in commit
  messages.
- Supabase credentials live in `.env.local` and are never committed.
