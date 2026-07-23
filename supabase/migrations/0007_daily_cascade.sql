-- Orgo migration 0007: daily carry-over cascade, task provenance, and an
-- editable planned total for the review.
-- Source of truth: docs/data-model.md §4/§7 and docs/decisions.md D13. Keep in sync.
--
-- Three changes, all serving one complaint: the review lied about a day once its
-- leftovers left. Wednesday with 3 of 5 done read "3/3" the next morning.
--
--   1. tasks.planned_date  — the day a task was PLANNED for, which carry-over
--                            never rewrites. The review counts by this, not by
--                            the bucket a task currently sits in.
--   2. day_plan_override   — a manual correction to a day's planned total, for
--                            when the honest derived number still isn't right.
--   3. rollover_days()     — replaces rollover_week(). Mon..Sat carry into the
--                            next day; Sunday empties into the backlog. A part-
--                            done task with subtasks SPLITS rather than moving.
--
-- Supersedes 0004 (one weekly sweep). See decisions.md D2, revised again.

-- 1. Provenance ---------------------------------------------------------------

alter table tasks add column if not exists planned_date date;

-- Backfill: a dated task was planned for the day it is in. Tasks already swept
-- into the backlog by 0004 have no recoverable plan date and stay null — that
-- history is gone, and inventing one would be worse than a gap.
update tasks set planned_date = date where date is not null and planned_date is null;

comment on column tasks.planned_date is
  'The day this task was planned for. Defaulted on insert from date; rewritten '
  'only by a deliberate user move (a replan), never by carry-over. The review '
  'counts by this column so a day keeps its denominator after its leftovers move.';

-- On insert, plan date defaults to the task's day. An explicit value wins, which
-- is how the split clone inherits its original's plan instead of claiming the
-- day it lands in.
create or replace function default_planned_date() returns trigger
language plpgsql as $$
begin
  new.planned_date := coalesce(new.planned_date, new.date);
  return new;
end $$;

drop trigger if exists tasks_default_planned_date on tasks;
create trigger tasks_default_planned_date
  before insert on tasks
  for each row execute function default_planned_date();

create index if not exists tasks_user_planned_idx
  on tasks (user_id, planned_date)
  where planned_date is not null;

-- 2. Editable planned total ---------------------------------------------------
-- Only the DENOMINATOR is overridable. The done count stays derived from
-- completed_at, so the review can be corrected but never flattered.

create table if not exists day_plan_override (
  user_id        uuid not null references auth.users(id) on delete cascade,
  plan_date      date not null,
  planned_total  integer not null check (planned_total >= 0),
  updated_at     timestamptz not null default now(),
  primary key (user_id, plan_date)
);

alter table day_plan_override enable row level security;

drop policy if exists "own plan overrides" on day_plan_override;
create policy "own plan overrides" on day_plan_override
  for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists day_plan_override_touch on day_plan_override;
create trigger day_plan_override_touch
  before update on day_plan_override
  for each row execute function touch_updated_at();

-- 3. One carry-over step ------------------------------------------------------
-- Everything still open in p_from moves to p_to. Factored out because the
-- nightly cascade and the been-away-a-week flush are the same operation with
-- different endpoints.
--
-- SECURITY INVOKER and scoped to auth.uid(), so RLS applies as normal. It is
-- grantable to authenticated for rollover_days' sake; the worst a direct call
-- can do is shuffle the caller's own buckets.

create or replace function carry_bucket(
  p_from    task_bucket,
  p_to      task_bucket,
  p_to_date date
)
returns integer
language plpgsql
security invoker
as $$
declare
  v_uid   uuid := auth.uid();
  v_base  double precision;
  v_task  record;
  v_clone uuid;
  v_n     integer;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- (a) Split part-done checklists. A task that is open but has BOTH ticked and
  -- unticked boxes is divided: the ticked boxes stay on the day that earned
  -- them, the unticked ones go forward under a fresh task of the same name.
  -- Moving the whole row would drag the day's evidence along with it.
  for v_task in
    select t.id, t.user_id, t.title, t.position, t.date, t.planned_date,
           t.duration_min, t.start_time, t.tag
      from tasks t
      where t.user_id = v_uid
        and t.bucket = p_from
        and t.done = false
        and exists (select 1 from subtasks s where s.task_id = t.id and s.done)
        and exists (select 1 from subtasks s where s.task_id = t.id and not s.done)
  loop
    -- The clone is created in the ORIGINAL's bucket, at the original's exact
    -- position, and is then picked up by the bulk move in (b) like any other
    -- open task. The original is about to become done, so it leaves the open
    -- ordering and the clone inherits its slot with no collision.
    --
    -- planned_date is copied, NOT defaulted: those boxes were planned for the
    -- original's day and the review has to keep counting them there.
    insert into tasks (user_id, title, bucket, date, planned_date, position,
                       duration_min, start_time, tag)
      values (v_task.user_id, v_task.title, p_from, v_task.date,
              v_task.planned_date, v_task.position,
              v_task.duration_min, v_task.start_time, v_task.tag)
      returning id into v_clone;

    update subtasks
      set task_id = v_clone
      where task_id = v_task.id and done = false;

    -- Every remaining box is now ticked, so the parent auto-completes — the same
    -- rule that fires when you tick the last box by hand (decisions.md D9). It is
    -- stamped with its last real completion, and being done it can never move
    -- again, which is precisely what pins the evidence to this day.
    update tasks
      set done = true,
          completed_at = coalesce(
            (select max(s.completed_at) from subtasks s where s.task_id = v_task.id),
            now())
      where id = v_task.id;
  end loop;

  -- (b) Carry every still-open task to the destination, ABOVE what is already
  -- there, preserving relative order — so an avoided task climbs and darkens
  -- (decisions.md D3). planned_date is deliberately untouched.
  select coalesce(min(position), 0) into v_base
    from tasks
    where user_id = v_uid and bucket = p_to;

  with carried as (
    select id,
           row_number() over (order by position) as rn,
           count(*) over () as n
      from tasks
      where user_id = v_uid and bucket = p_from and done = false
  )
  update tasks t
    set bucket = p_to,
        date = p_to_date,
        position = v_base - (carried.n - carried.rn + 1)
    from carried
    where t.id = carried.id;

  get diagnostics v_n = row_count;
  return v_n;
end $$;

grant execute on function carry_bucket(task_bucket, task_bucket, date) to authenticated;

-- 4. The nightly cascade ------------------------------------------------------
--
-- One boundary is crossed per elapsed day. For each day D between the last
-- rollover and today, whatever is still open in D's bucket moves into D+1's
-- bucket — or, when D is a Sunday, into the backlog.
--
-- Idempotency is guarded by user_state.last_rollover_on, and the whole cascade
-- runs in one transaction (a function body is atomic). Running it twice in a day
-- is a no-op.
--
-- "Today" comes from the CLIENT (p_today) so the day boundary follows the user's
-- LOCAL midnight, not the server's UTC clock.

create or replace function rollover_days(p_today date)
returns integer
language plpgsql
security invoker
as $$
declare
  v_uid    uuid := auth.uid();
  v_last   date;
  v_cursor date;
  v_dow    integer;
  v_moved  integer := 0;
  v_days   constant task_bucket[] :=
    array['mon','tue','wed','thu','fri','sat','sun']::task_bucket[];
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  insert into user_state (user_id)
    values (v_uid)
    on conflict (user_id) do nothing;

  select last_rollover_on into v_last
    from user_state
    where user_id = v_uid
    for update;

  -- First run ever: record a baseline, carry nothing. Without this the very
  -- first open would cascade a board that was never left overnight.
  if v_last is null then
    update user_state
      set last_rollover_on = p_today, updated_at = now()
      where user_id = v_uid;
    return 0;
  end if;

  -- Already run today, or the clock went backwards.
  if v_last >= p_today then
    return 0;
  end if;

  if p_today - v_last >= 7 then
    -- Away a week or more. Every day bucket now holds tasks whose real age is
    -- unknowable — bucket 'mon' cannot say whether it means this Monday or one
    -- five weeks ago — so day-by-day replay would be false precision. Flush the
    -- whole board into the backlog instead: you have been gone a week, nothing
    -- on the board is still a plan. This is the cascade's fixed point anyway,
    -- since any 7-day span crosses a Sunday.
    -- Reverse day order, because each call lands its batch ABOVE the last: going
    -- Sunday-first leaves the backlog reading Mon → Sun top to bottom (D3).
    for v_dow in reverse 7..1 loop
      v_moved := v_moved + carry_bucket(v_days[v_dow], 'backlog', null);
    end loop;
  else
    v_cursor := v_last;
    while v_cursor < p_today loop
      v_dow := extract(isodow from v_cursor)::int;
      if v_dow = 7 then
        v_moved := v_moved + carry_bucket('sun', 'backlog', null);
      else
        v_moved := v_moved
          + carry_bucket(v_days[v_dow], v_days[v_dow + 1], v_cursor + 1);
      end if;
      v_cursor := v_cursor + 1;
    end loop;
  end if;

  update user_state
    set last_rollover_on = p_today, updated_at = now()
    where user_id = v_uid;

  return v_moved;
end $$;

grant execute on function rollover_days(date) to authenticated;

-- The weekly sweep is gone. Leaving it callable would leave a live RPC that
-- dumps an entire week into the backlog in one shot.
drop function if exists rollover_week(date);
