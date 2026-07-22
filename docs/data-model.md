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

**One weekly sweep**, not a daily cascade. Runs client-side on the first open of a
new week; the DB does the work in the `rollover_week` RPC
(`supabase/migrations/0004`). See [`decisions.md`](decisions.md#d2--carry-over-trigger).

**The invariant: it must be idempotent.** Running it twice in a row must be
indistinguishable from running it once. Two devices, a refresh mid-run, a clock
that jumps — all of these will happen.

Procedure (all of it inside the RPC, one transaction):

1. Read `user_state.last_rollover_on`. If the week containing it is the current
   week (or later), stop. On the first run ever, record today as the baseline and
   sweep nothing — otherwise the current in-progress week would be dumped.
2. Take every task in a **day bucket** (`mon`..`sun`) where `done = false`, in day
   order then `position` order.
3. Move the whole set to the **backlog** (`bucket = 'backlog'`, `date = null`),
   preserving relative order, placed **above** the tasks already there (assign
   positions below the backlog's current minimum).
4. Leave completed tasks exactly where they are. They are the review's evidence.
5. Set `last_rollover_on = today`.

"Today" is passed in by the client (`p_today`) so the week boundary follows the
user's **local** calendar, not the server's UTC clock. `rollover_week` is
`SECURITY INVOKER`, so RLS still scopes every row to the caller.

The board groups tasks by `bucket`, never by date, so last week's leftovers keep
showing under their days until this sweep moves them out. That is the sweep's whole
job: at week's end the days empty into the backlog and the new week starts clean.

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
  set on the done-toggle just like a task's, but a subtask **still never feeds the
  weekly review**; the column exists only so a promoted subtask keeps its stamp.
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
parent reopens it, all via the same completion path a manual toggle uses.
