# Orgo — Product Spec

**Status:** v0.2. Supersedes the v0.1 draft. Everything the v0.1 draft left open
now has a proposed answer in [`decisions.md`](decisions.md); this document
describes the app as those answers assume it.

A minimal, phone-only weekly task app. Seven fixed day columns plus a backlog,
drag-and-drop priority ordering, automatic overnight carry-over, and a weekly
review.

---

## 1. Scope of v1

**In:** 7 fixed days (Mon–Sun) + backlog, a second board for **next week**,
add/edit/delete tasks, complete/uncomplete, drag to reorder within a day, drag
between days and to/from backlog, automatic carry-over of undone tasks,
priority-shaded task cards, today highlighted, weekly review view, Supabase
persistence, read-only offline, optional per-task duration, per-task subtask
checklists.

**Out (v1):** notes, recurring tasks, reminders/notifications, calendar
integration, sharing, desktop layout, tag UI.

*Subtasks moved in-scope after v0.2 — see
[`decisions.md D9`](decisions.md#d9--subtasks-are-a-checklist-not-nested-tasks).*

**Deferred but designed for:** category/tag per task, historical week summaries,
calendar sync. Columns exist in the schema; no UI ships in v1.

---

## 2. Core model

### Week

Fixed **Monday–Sunday**. Advances automatically with the real date. The current
day is visually highlighted.

**Two weeks are plannable: this one and the next**, as two tabs over the same
seven days. Next week is where a task goes when it is not for this week. It has
no "today" to highlight, and it shares the backlog — dragging out of the backlog
is how it gets planned.

When the week ends, next week *becomes* this week and a fresh empty one takes its
place. Nothing is moved to make that happen: a task carries the calendar date it
was planned for, so the tabs are two filters over the same data and the boundary
is just the calendar advancing. The week just ended leaves its unfinished tasks in
the backlog — which is the ordinary Sunday carry-over, not a separate rule. See
[`decisions.md D14`](decisions.md#d14--next-week-is-a-filter-not-a-place).

No navigation beyond those two. Past weeks belong to the review.

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

### Carry-over (nightly)

- At the end of each day Mon–Sat, whatever is still open moves to the **next
  day**. At the end of **Sunday** there is no next day, so the leftovers go to
  the **backlog** instead.
- Carried tasks keep their relative order and land **above** what is already in
  the destination, so an avoided task climbs and darkens each night.
- Completed tasks never move. They stay on the day they were completed, which is
  what makes the weekly review meaningful.
- **A part-done checklist splits rather than moving.** A task whose subtasks are
  partly ticked leaves the ticked ones on the day that earned them — the parent
  auto-completes there, since all its remaining boxes are done — and a new task
  of the same name carries the unticked ones forward.
- **Next week is never touched.** Each carry step names a source *date*, and next
  week's dates are still in the future. It sits untouched until it becomes this
  week.
- **Nothing open is left on a day that has passed.** Whatever the cascade cannot
  reach — a long absence, a task dragged onto a day already gone — is swept to the
  backlog on the next open.
- Carry-over runs client-side on first open, once per day, and is **idempotent**.
  See [`decisions.md`](decisions.md#d2--carry-over-model-and-trigger).

### Backlog

A permanent eighth bucket, shared by both weeks. Receives Sunday's leftovers, and
so, at the end of a week, everything that week did not finish. Tasks can be
dragged out onto any day of either week. Nothing leaves the backlog automatically.

### Weekly review

Shows, for a week: how much of each day's plan was completed, per day and in
total.

**A day is counted by what was planned for it, not by what is still sitting in
it.** Once Wednesday's leftovers cascade into Thursday, counting the Wednesday
bucket would read 3/3 for a day that was really 3 of 5 — the numerator survives
in `completed_at`, but the denominator walks away. So every task records the day
it was *planned* for (`planned_date`), which carry-over never rewrites. See
[`decisions.md D13`](decisions.md#d13--the-review-counts-by-plan-not-by-bucket).

Any day's planned total can be **corrected by hand** (the pencil on its row).
Only the total — the done count stays derived from `completed_at`, so the review
can be corrected but never flattered.

The mockup's review view shows completion percentage, done/planned/backlog
counts, and a per-day completion bar. Treat that as the v1 starting point, not a
ceiling.

### Overall review

A second review covering **everything on record**, not just the current week —
the counterpart to the weekly one, which resets every Monday.

It ships **blank**. `planned_date` and `completed_at` already hold the whole
history, so it needs no new data; what it needs is a decision about what an
all-time figure should say, since a lifetime completion percentage converges and
then stops moving. Candidates are listed under *Still genuinely open* in
[`decisions.md`](decisions.md#still-genuinely-open).

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
