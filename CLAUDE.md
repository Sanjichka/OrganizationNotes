# CLAUDE.md

Working context for AI assistants. Keep it short and current — if it drifts from
reality it does damage.

## What this is

Orgo: a phone-only weekly task planner PWA. Seven fixed days (Mon–Sun) plus a
backlog. Priority is vertical position; card colour is derived from it.

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

**Completed tasks never move.** Not on carry-over, not on reorder. `completed_at`
plus the original `date` is the entire basis of the weekly review; moving a
completed task destroys history.

**Carry-over is idempotent.** Guarded by `user_state.last_rollover_on`, applied in
one transaction. It will get run twice; that must be a no-op.

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
