# Data Model

Postgres, via Supabase. Single user, but authenticated and row-level-secured so
the data is not publicly readable.

---

## 1. Schema

```sql
create type task_bucket as enum
  ('mon','tue','wed','thu','fri','sat','sun','backlog');

create table tasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,

  title         text not null
                  check (length(btrim(title)) between 1 and 200),
  bucket        task_bucket not null,
  date          date,
  planned_date  date,                       -- the day this was PLANNED for
  position      double precision not null,

  done          boolean not null default false,
  completed_at  timestamptz,

  duration_min  integer check (duration_min > 0),
  start_time    time,                       -- "when": optional clock time of day
  tag           text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- backlog tasks have no date; dated tasks are never in the backlog
  constraint backlog_has_no_date
    check ((bucket = 'backlog') = (date is null)),

  -- done and completed_at can never disagree
  constraint done_matches_completed_at
    check (done = (completed_at is not null))
);

create index tasks_user_bucket_idx
  on tasks (user_id, bucket, done, position);

create index tasks_user_date_idx
  on tasks (user_id, date)
  where date is not null;
```

The two check constraints are the important part. They make the impossible
states — a backlog task carrying a date, a task marked done with no completion
timestamp — unrepresentable rather than merely discouraged. The weekly review
depends entirely on `completed_at` being trustworthy.

`planned_date` is added by `supabase/migrations/0007`. It is the day a task was
*planned* for, which after a night of carry-over is no longer the day it sits in.
A `before insert` trigger defaults it to `date` (an explicit value wins, which is
how the split clone inherits its original's plan); [carry-over](#4-carry-over)
never touches it; a deliberate user move rewrites it, because a move is a replan.
The weekly review counts by this column and nothing else — see
[`decisions.md D13`](decisions.md#d13--the-review-counts-by-plan-not-by-bucket).
It is nullable: a task born in the backlog was planned for no day, and rows that
predate the column keep null if they had already been swept.

`start_time` is added by `supabase/migrations/0005`, not the initial schema. It
is pure display metadata — a `time`, never a `timestamptz`, because a task's day
is its bucket and a backlog task has none — and it constrains nothing: not the
canonical sort, not shading, not carry-over. See [`decisions.md D10`](decisions.md#d10--when-a-clock-time-not-a-date).

### `updated_at`

```sql
create function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger tasks_touch
  before update on tasks
  for each row execute function touch_updated_at();
```

### Rollover bookkeeping

Carry-over runs on the client and must not run twice for the same day.

```sql
create table user_state (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  last_rollover_on  date,
  updated_at        timestamptz not null default now()
);
```

---

## 2. Row-level security

```sql
alter table tasks      enable row level security;
alter table user_state enable row level security;

create policy "own tasks" on tasks
  for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own state" on user_state
  for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

`for all` covers select, insert, update and delete. `with check` is what stops a
client writing rows attributed to somebody else — `using` alone would not.

---

## 3. Ordering

`position` is a **fractional rank**, not an index. Moving a task between two
neighbours means writing one row:

```
new_position = (position_above + position_below) / 2
```

- Dropped at the top: `first_position - 1`
- Dropped at the bottom: `last_position + 1`
- Into an empty bucket: `0`

This keeps a drag to a single-row update rather than renumbering the whole day.

**Precision.** `double precision` survives roughly 50 consecutive midpoint
insertions between the same pair before the gap collapses. That is far beyond
realistic use, but the failure is silent and ugly, so guard it: if a computed gap
falls below `1e-6`, renumber that bucket to `0, 1, 2, …` and retry. A dozen lines,
written once.

### Canonical sort

```sql
select * from tasks
where user_id = auth.uid() and bucket = $1
order by done asc, completed_at asc nulls first, position asc;
```

Which produces exactly the spec's ordering:

- open tasks first, by `position` — every open row has `completed_at = null`, so
  they group together and fall through to `position`
- completed tasks below, in completion order

Use this sort everywhere. Do not re-sort ad hoc in components.

---

## 4. Carry-over

**A nightly cascade.** Mon–Sat carry into the next day; Sunday empties into the
backlog. Runs client-side on first open; the DB does the work in the
`rollover_days` RPC (`supabase/migrations/0008`, which supersedes `rollover_week`
from 0004 and `carry_bucket` from 0007). See
[`decisions.md D2`](decisions.md#d2--carry-over-model-and-trigger).

**Every step is keyed by date, never by bucket.** With two weeks on the board
(§8), bucket `sun` names two different Sundays; the source date names one day.
This is what keeps next week's plan out of the cascade's reach — a future date is
never a source, so no special case is needed to protect it.

**The invariant: it must be idempotent.** Running it twice in a row must be
indistinguishable from running it once. Two devices, a refresh mid-run, a clock
that jumps — all of these will happen.

Procedure (all of it inside the RPC, one transaction):

1. Read `user_state.last_rollover_on`. If it is today or later, stop. On the
   first run ever, record today as the baseline and carry nothing — otherwise a
   board that was never left overnight would be cascaded.
2. For each day `D` from `last_rollover_on` up to yesterday, run one carry step
   from `D` into `D + 1` — or into the backlog when `D` is a Sunday. Missed
   nights replay in order, so opening on Thursday after a Monday leaves the board
   exactly as three nightly runs would have. Skipped entirely if seven or more
   days have elapsed: a task that has sat unmoved for eight days is not helped by
   being walked forward eight times, and step 3 is where every one of those days
   would land anyway (any 7-day span crosses a Sunday).
3. Sweep: **nothing open may be left on a day that has already passed.** Every
   remaining open day-bucket task dated before today goes straight to the backlog,
   newest date first so the backlog reads oldest → newest. After a full replay
   this finds nothing — the last step lands everything on today. It catches the
   long absence skipped above, and tasks stranded on stale dates (by the old
   weekly sweep, or by being dragged onto a day that has already passed), which a
   date-keyed replay would never revisit.
4. Each carry step, in `carry_day`:
   - **Split part-done checklists first.** An open task with both ticked and
     unticked subtasks is divided: a clone is inserted in the *source* bucket at
     the original's position carrying the unticked subtasks (and inheriting the
     original's `planned_date`, not the destination's), and the original — now
     holding only ticked boxes — auto-completes, stamped with the latest
     `completed_at` among them. The clone is then carried by the bulk move like
     any other open task.
   - **Move every still-open task** to the destination, preserving relative order,
     placed **above** what is already there (positions below the destination's
     current minimum). `date` follows the destination; `planned_date` does not.
5. Set `last_rollover_on = today`.

Completed tasks are never moved by any of this. They are the review's evidence,
and the split exists precisely so a half-finished checklist cannot smuggle its
evidence off the day that earned it.

"Today" is passed in by the client (`p_today`) so the day boundary follows the
user's **local** midnight, not the server's UTC clock. Both `rollover_days` and
`carry_day` are `SECURITY INVOKER`, so RLS still scopes every row to the caller.

---

## 5. Offline

The local cache is a **read-only mirror**. Cache the current week and backlog on
every successful fetch; serve it when the network is unavailable, with the UI in
an explicit read-only state.

No write queue. A queue implies conflict resolution, and reconciling reordered
positions across a stale queue is exactly the class of bug that quietly corrupts
the ordering. An honest "you're offline" is the better product.

Carry-over does **not** run offline. It needs a durable `last_rollover_on` to
stay idempotent.

---

## 6. Subtasks

A task nested under another task, one level deep. See
[`decisions.md D9`](decisions.md#d9--subtasks-are-a-checklist-not-nested-tasks)
for why this is a child table rather than a `parent_id` on `tasks`, and
[`D11`](decisions.md#d11--subtasks-gain-task-parity-and-drag-conversion) for why
it later grew task-parity fields and drag conversion.

```sql
create table subtasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  task_id       uuid not null references tasks(id) on delete cascade,

  title         text not null
                  check (length(btrim(title)) between 1 and 200),
  position      double precision not null,
  done          boolean not null default false,

  -- Task-parity fields (0006), so a task can be dragged in and back losslessly.
  duration_min  integer check (duration_min > 0),
  start_time    time,
  completed_at  timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index subtasks_task_idx on subtasks (task_id, position);
```

The design lives in the shape of the table:

- **No `bucket` or `date`.** A subtask has no day of its own; it follows its
  parent. `on delete cascade` means deleting the parent removes it, with no client
  cleanup.
- **`duration_min`, `start_time`, `completed_at`** mirror `tasks` exactly (D11), so
  dragging a task into a subtask — and back out — loses nothing. `completed_at` is
  set on the done-toggle just like a task's. A subtask's `done` **counts as its own
  unit in the weekly review** (D12) — a task with subtasks is represented by its
  boxes rather than its own flag — while `completed_at` also lets a promoted
  subtask keep its stamp.
- **`position` is fractional**, exactly as for tasks (§3) — scoped per parent —
  and reuses the same helpers. Subtasks are shown in plain `position asc` order;
  the task canonical sort does not apply to them (done ones stay in place, struck
  through, rather than sinking to a done section).

RLS mirrors `tasks`: a single `"own subtasks"` policy `for all`
using/with-check `auth.uid() = user_id`, plus the shared `touch_updated_at`
trigger. Subtasks are never shaded and never carried over independently, so none
of the task invariants extend to them.

**Auto-complete** (a client rule, not a constraint): checking the last open box
completes the parent, and unchecking a box — or adding one — on a completed
parent reopens it, all via the same completion path a manual toggle uses. The
[carry-over split](#4-carry-over) leans on the same rule from the server side: a
parent left holding only ticked boxes is completed then and there.

---

## 7. Plan overrides

One row per corrected day. Added by `supabase/migrations/0007`.

```sql
create table day_plan_override (
  user_id        uuid not null references auth.users(id) on delete cascade,
  plan_date      date not null,
  planned_total  integer not null check (planned_total >= 0),
  updated_at     timestamptz not null default now(),
  primary key (user_id, plan_date)
);
```

**Only the denominator is overridable.** The review's done count stays derived
from `completed_at`, so a day's figure can be corrected but never flattered —
see [`decisions.md D13`](decisions.md#d13--the-review-counts-by-plan-not-by-bucket).

An absent row means "use the derived total", so clearing a correction is a delete
rather than a sentinel value. The percentage is clamped to 100 at render time: a
user may set a total below what they actually finished, and the ring should not
overflow when they do.

RLS and the `touch_updated_at` trigger mirror `tasks` — **and so does the
grant**, which 0007 omitted and `supabase/migrations/0009` supplies. A policy
without `grant select, insert, update, delete … to authenticated` fails with
*permission denied* before the policy is ever consulted; see §2.

---

## 8. Two weeks

The board plans **this week and next**, as two tabs. Nothing in the schema knows
about it.

A day-bucket task always carries a real calendar `date` — the
`backlog_has_no_date` check makes that an invariant, not a convention — so the
date alone says which week the task was planned into. Week and Next week are two
filters over the same table:

| Board | Shows |
|---|---|
| Week | day tasks dated in the current Mon–Sun, plus the backlog |
| Next week | day tasks dated in the following Mon–Sun, plus the backlog |

The backlog is week-agnostic and appears on both; dragging out of it is how next
week gets planned. Adding to Tuesday on the next-week board dates the task next
Tuesday, and `planned_date` defaults from `date` as always, so the task counts
toward next week's review when that week arrives.

**The week turning over writes nothing.** No row is copied, moved or cleared —
next week's tasks simply start matching the current-week filter, and the week
after that is empty because nothing is dated a fortnight out. There is no second
carry-over and therefore no second idempotency guard. The unfinished tasks of the
week just ended reach the backlog by the ordinary Sunday cascade step, not by any
week-boundary logic. See
[`decisions.md D14`](decisions.md#d14--next-week-is-a-filter-not-a-place).

**Two consequences of filtering by date:**

- Completed tasks from earlier weeks are no longer on the board. They never move
  (they are the review's evidence) and previously accumulated in their day bucket
  indefinitely. The review still finds them by `planned_date`.
- An **open** task dated outside both weeks is shown on the current week anyway.
  Carry-over has failed it, and the alternative is a task that exists but cannot
  be seen. The [sweep](#4-carry-over) is what normally prevents this.
