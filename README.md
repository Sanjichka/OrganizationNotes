# Orgo

A phone-only weekly task planner. Seven fixed days plus a backlog, drag-to-rank
priority, automatic overnight carry-over, and a weekly review.

Priority is not a label you pick. It is *where the task sits*. The card's colour
shade is derived from its position — darkest at the top of the day, lightest at
the bottom — so a day's list reads as a gradient of urgency at a glance.

---

## Status

Pre-implementation. The product spec, data model, design system, and stack are
settled; no application code has been written yet.

| Area | State |
|---|---|
| Product spec | Settled — [`docs/spec.md`](docs/spec.md) |
| Data model | Settled — [`docs/data-model.md`](docs/data-model.md) |
| Design system | Extracted from the mockup — [`docs/design-system.md`](docs/design-system.md) |
| Open decisions | Proposed, not locked — [`docs/decisions.md`](docs/decisions.md) |
| Code | Not started |

---

## What it does

**Seven days, Monday to Sunday.** The week advances with the real date. There is
no manual week navigation — looking backwards is what the review view is for.
Today is highlighted.

**A task is a single line of text.** No notes, no subtasks. It lives in one of
eight buckets: `mon`…`sun` or `backlog`.

**Drag to prioritise.** Reorder within a day, drag between days, drag into and
out of the backlog. Dropping into a new bucket recalculates that bucket's shading.

**Tap to complete.** The task is struck through and drops below every open task
in its day. Un-completing returns it to the bottom of the open section — it does
not remember its old rank.

**Undone work carries itself over.** Anything still open at the end of its day
moves to the next day, keeping relative order. Anything still open at the end of
Sunday goes to the **backlog**, not round to Monday. Completed tasks never move —
they stay on the day they were completed, which is what makes the weekly review
mean anything.

**The backlog is permanent.** It receives end-of-week leftovers. Tasks can be
dragged out onto any day. Nothing leaves it automatically.

### Not in v1

Notes, subtasks, recurring tasks, reminders, calendar integration, sharing,
desktop layout.

Designed for but deferred: tags per task, historical week summaries, calendar
sync. The database columns exist; the UI does not.

---

## Stack

| Layer | Choice |
|---|---|
| Shell | Installable PWA — portrait, phone only |
| UI | React 18 + TypeScript |
| Build | Vite + `vite-plugin-pwa` |
| Drag & drop | `@dnd-kit` with the touch sensor |
| Data | Supabase (Postgres + Auth) |
| Offline | Cached last-known state, **read-only** |

Why a PWA and not native: see [`docs/decisions.md`](docs/decisions.md#d1--app-shape).

### Two constraints that are easy to get wrong

**Drag-and-drop must be touch-native.** HTML5 drag events are mouse-only and do
nothing useful on a phone. Long-press to lift, auto-scroll at the screen edges.
The mockup in `design/` uses HTML5 DnD purely because it runs in a desktop
browser — do not carry that approach into the app.

**Offline is read-only, and says so.** When there is no connection the UI shows a
clear read-only state. It does not silently queue edits — a queue that
reconciles badly is worse than an honest refusal.

---

## Getting started

Nothing to run yet. Once scaffolded:

```bash
npm install
npm run dev
```

Supabase credentials go in `.env.local` (never committed):

```
VITE_SUPABASE_URL=…
VITE_SUPABASE_ANON_KEY=…
```

Schema and row-level security policies live in
[`docs/data-model.md`](docs/data-model.md). It is single-user, but auth is still
required so the data is not publicly readable.

---

## The design

[`design/Orgo.dc.html`](design/Orgo.dc.html) is the canonical visual reference —
a working, interactive mockup of the full week and review views. Open it in a
browser to see the real thing.

It needs `support.js` (the `dc-runtime` bundle) sitting next to it; see
[`design/README.md`](design/README.md).

[`docs/design-system.md`](docs/design-system.md) extracts the rules from that
mockup — the per-day hue map, the OKLCH shading formula, contrast flipping,
spacing and type — so they can be implemented without reverse-engineering the
HTML.

---

## Repository layout

```
README.md               you are here
CLAUDE.md               working context for AI assistants
docs/
  spec.md               the product spec — what the app is
  data-model.md         Postgres schema, RLS, ordering strategy
  design-system.md      colour, type, spacing, motion
  decisions.md          resolved and open questions, with reasoning
design/
  Orgo.dc.html          interactive mockup — canonical visual reference
  README.md             how to open it
```
