-- Orgo migration 0008: a second planning week, and a date-aware carry-over.
-- Source of truth: docs/data-model.md §4/§8 and docs/decisions.md D14. Keep in sync.
--
-- The app gains a "Next week" board. It stores NOTHING new: a day-bucket task
-- always carries a real calendar date (the backlog_has_no_date check makes that
-- an invariant, not a convention), so the date alone already says which week a
-- task was planned into. This week and next week are two filters over one table,
-- and the week turning over is not a migration — the same rows simply start
-- matching the other filter.
--
-- That only works if carry-over stops keying off the bucket. `carry_bucket` moved
-- every open task in bucket 'sun'; with a second week on the board that is now
-- two different Sundays, and next week's plan would be swept into the backlog the
-- moment this week ended. `carry_day` keys off the source DATE instead, which is
-- unambiguous, and therefore cannot touch a future-dated task at all.
--
-- Supersedes carry_bucket from 0007. The cascade's behaviour for a single week is
-- unchanged.

-- 1. One carry-over step, keyed by date ---------------------------------------
-- Everything still open ON p_from_date moves to p_to / p_to_date. The source
-- bucket is not named: the date identifies the day, and a row whose bucket and
-- date disagree (which the schema forbids reaching) still gets carried rather
-- than stranded.
--
-- SECURITY INVOKER and scoped to auth.uid(), so RLS applies as normal.

create or replace function carry_day(
  p_from_date date,
  p_to        task_bucket,
  p_to_date   date
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
    select t.id, t.user_id, t.title, t.bucket, t.position, t.date, t.planned_date,
           t.duration_min, t.start_time, t.tag
      from tasks t
      where t.user_id = v_uid
        and t.bucket <> 'backlog'
        and t.date = p_from_date
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
      values (v_task.user_id, v_task.title, v_task.bucket, v_task.date,
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
      where user_id = v_uid
        and bucket <> 'backlog'
        and date = p_from_date
        and done = false
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

grant execute on function carry_day(date, task_bucket, date) to authenticated;

-- 2. The nightly cascade ------------------------------------------------------
--
-- One boundary is crossed per elapsed day. For each day D between the last
-- rollover and today, whatever is still open on D moves onto D + 1 — or, when D
-- is a Sunday, into the backlog. So a week ending is not a special case: it is
-- the ordinary Sunday step, and next week's tasks are untouched by it because
-- their dates are still in the future.
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

  -- (a) Replay the nights actually missed, one at a time, so opening on Thursday
  -- after a Monday leaves the board exactly as three nightly runs would have.
  --
  -- Skipped entirely if the gap is a week or more: a task that has sat unmoved
  -- for eight days is not helped by being walked forward eight times, and the
  -- sweep below is where every one of those days would land anyway (any 7-day
  -- span crosses a Sunday, and Sunday empties into the backlog).
  if p_today - v_last < 7 then
    v_cursor := v_last;
    while v_cursor < p_today loop
      v_dow := extract(isodow from v_cursor)::int;
      if v_dow = 7 then
        v_moved := v_moved + carry_day(v_cursor, 'backlog', null);
      else
        v_moved := v_moved
          + carry_day(v_cursor, v_days[v_dow + 1], v_cursor + 1);
      end if;
      v_cursor := v_cursor + 1;
    end loop;
  end if;

  -- (b) Nothing open may be left sitting on a day that has already passed. After
  -- a full replay this finds nothing — the last step lands everything on today.
  -- It catches the two cases the replay cannot: a long absence (skipped above),
  -- and tasks stranded on stale dates by an earlier carry-over model (0004 swept
  -- weekly, so an open task could sit in a day bucket with last month's date).
  -- Being date-keyed, the replay would never revisit those days.
  --
  -- Descending date order, because each call lands its batch ABOVE the last:
  -- newest-first leaves the backlog reading oldest → newest, top to bottom (D3).
  -- Only dates strictly before today are touched, so a plan made for next week
  -- survives any absence intact — it is still in the future.
  for v_cursor in
    select distinct t.date
      from tasks t
      where t.user_id = v_uid
        and t.bucket <> 'backlog'
        and t.done = false
        and t.date < p_today
      order by t.date desc
  loop
    v_moved := v_moved + carry_day(v_cursor, 'backlog', null);
  end loop;

  update user_state
    set last_rollover_on = p_today, updated_at = now()
    where user_id = v_uid;

  return v_moved;
end $$;

grant execute on function rollover_days(date) to authenticated;

-- The bucket-keyed step is gone. Leaving it callable would leave a live RPC that
-- cannot tell this Sunday from next Sunday.
drop function if exists carry_bucket(task_bucket, task_bucket, date);
