# Orgo — Product Spec

**Status:** v0.2. Supersedes the v0.1 draft. Everything the v0.1 draft left open
now has a proposed answer in [`decisions.md`](decisions.md); this document
describes the app as those answers assume it.

A minimal, phone-only weekly task app. Seven fixed day columns plus a backlog,
drag-and-drop priority ordering, automatic overnight carry-over, and a weekly
review.

---

## 1. Scope of v1

**In:** 7 fixed days (Mon–Sun) + backlog, add/edit/delete tasks,
complete/uncomplete, drag to reorder within a day, drag between days and to/from
backlog, automatic carry-over of undone tasks, priority-shaded task cards, today
highlighted, weekly review view, Supabase persistence, read-only offline,
optional per-task duration, per-task subtask checklists.

**Out (v1):** notes, recurring tasks, reminders/notifications, calendar
integration, sharing, desktop layout, tag UI.

*Subtasks moved in-scope after v0.2 — see
[`decisions.md D9`](decisions.md#d9--subtasks-are-a-checklist-not-nested-tasks).*

**Deferred but designed for:** category/tag per task, historical week summaries,
calendar sync. Columns exist in the schema; no UI ships in v1.

---

## 2. Core model

### Week

Fixed **Monday–Sunday**. Advances automatically with the real date. No manual
week navigation in v1 — backwards navigation into past weeks belongs to the
review view. The current day is visually highlighted.

### Task

| Field | Notes |
|---|---|
| `id` | uuid |
| `title` | single line of text; the only required field |
| `bucket` | one of `mon`…`sun` or `backlog` |
| `date` | the actual calendar date the task sits on; null for backlog |
| `position` | fractional rank within its bucket — this *is* the priority |
| `done` | boolean |
| `completed_at` | timestamp, null when not done |
| `duration_min` | nullable — shown in v1 UI |
| `tag` | nullable — column exists, no v1 UI |
| `created_at` / `updated_at` | |

No notes field.

### Subtask

A task may hold a checklist of subtasks — each just a `title` and a `done` flag,
ordered by `position`. Subtasks have no day, duration, shading or independent
carry-over; they follow their parent. Checking the last one completes the parent
(and unchecking reopens it). Full reasoning in
[`decisions.md D9`](decisions.md#d9--subtasks-are-a-checklist-not-nested-tasks).

Full schema in [`data-model.md`](data-model.md).

### Priority = order

Priority is expressed purely by vertical position. There is no separate
high/medium/low label. Card shading is **derived** from position — darkest at the
top, lightest at the bottom — and recalculated whenever the list changes.

Shading is never stored. It is computed at render time from a task's rank among
the *open* tasks in its bucket. See [`design-system.md`](design-system.md).

---

## 3. Behaviours

### Adding

Add a task to any day or the backlog. New tasks append to the bottom — lowest
priority — by default. The user drags them up if urgent.

### Reordering & moving

- Drag to reorder within a day.
- Drag between days.
- Drag into and out of the backlog.
- Dropping into a new bucket recalculates that bucket's shading.

Drag must be touch-native: long-press to lift, auto-scroll at screen edges.

### Completing

- Tap to complete: the task is struck through and **drops to the bottom** of its
  day.
- Completed tasks sit below all open tasks, in completion order.
- Reversible — un-completing returns the task to the bottom of the *open*
  section. It does not remember its old rank.
- Completed tasks are visually muted rather than participating in the priority
  shade scale.

### Carry-over (weekly)

- At the end of the week, **every** task still open across **all seven days**
  moves to the **backlog** for the next week — one sweep, not a nightly cascade.
  Days therefore start each Monday empty; the backlog holds whatever went
  unfinished. *(This replaces the v0.1 draft's daily model — reasoning in
  [`decisions.md`](decisions.md#d2--carry-over-trigger).)*
- Carried tasks keep their relative order and land **above** the existing backlog,
  so the freshest leftovers are the first thing you see when re-planning.
- Completed tasks never move. They stay on the day they were completed, which is
  what makes the weekly review meaningful.
- Carry-over runs client-side on the first open of a new **week**, and is
  **idempotent** — running it twice must not move anything twice. See
  [`decisions.md`](decisions.md#d2--carry-over-trigger).

### Backlog

A permanent eighth bucket. Receives end-of-week leftovers. Tasks can be dragged
out onto any day. Nothing leaves the backlog automatically.

### Weekly review

Shows, for a week: tasks completed vs. carried over vs. dropped to backlog, per
day and in total.

Exact metrics remain deliberately undefined. The data model retains every task
with its `date` and `completed_at`, so any reasonable summary can be computed
retroactively — nothing needs deciding now to avoid painting into a corner.

The mockup's review view shows completion percentage, done/planned/backlog
counts, and a per-day completion bar. Treat that as the v1 starting point, not a
ceiling.

---

## 4. Platform & data

- **Phone only.** Portrait. Installable PWA — see
  [`decisions.md`](decisions.md#d1--app-shape).
- Seven days do not fit side by side on a phone. The layout is a **vertical
  scroll** through collapsible day sections, matching the mockup.
- Drag-and-drop uses touch-native handling, not mouse-event DnD.
- **Supabase** as the datastore.
- Single user. Auth still required so the data is not publicly readable.
- **Offline:** last known state is readable from a local cache. Edits require a
  connection; when offline the UI shows a clear read-only state rather than
  silently queueing changes.

---

## 5. Look & feel

Deliberately minimal. One hue per day, expressed in shades by priority.

The design direction is supplied as working code in
[`design/Orgo.dc.html`](../design/Orgo.dc.html), with the rules extracted into
[`design-system.md`](design-system.md).
