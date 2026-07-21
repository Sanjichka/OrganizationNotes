-- Orgo migration 0004: weekly carry-over (rollover) RPC.
-- Source of truth: docs/data-model.md §4 and docs/decisions.md D2/D3. Keep in sync.
--
-- Model: ONE weekly sweep. On the first app open of a new week, every still-open
-- task sitting in a day bucket (mon..sun) is moved to the backlog, preserving
-- relative order and landing ABOVE the existing backlog. Completed tasks never
-- move (they are the weekly review's evidence). Existing backlog tasks stay put.
--
-- Idempotency is guarded by user_state.last_rollover_on and the whole sweep runs
-- in a single transaction (a function body is atomic), so a half-applied rollover
-- is impossible and running it twice is a no-op.
--
-- "Today" is supplied by the CLIENT (p_today) so the week boundary follows the
-- user's LOCAL calendar, not the server's UTC clock — see decisions.md D2. The
-- function is SECURITY INVOKER: RLS still scopes every row to auth.uid().

create or replace function rollover_week(p_today date)
returns integer
language plpgsql
security invoker
as $$
declare
  v_uid          uuid := auth.uid();
  v_this_monday  date;
  v_last         date;
  v_last_monday  date;
  v_base         double precision;
  v_swept        integer;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- Monday of the week containing p_today (isodow: Mon=1 .. Sun=7).
  v_this_monday := p_today - (extract(isodow from p_today)::int - 1);

  -- Ensure a bookkeeping row exists, then lock it so two concurrent opens
  -- (two devices, a double-fired effect) serialize and the second sees the
  -- already-advanced marker.
  insert into user_state (user_id)
    values (v_uid)
    on conflict (user_id) do nothing;

  select last_rollover_on into v_last
    from user_state
    where user_id = v_uid
    for update;

  -- First run ever: record a baseline for this week, sweep nothing. Without this
  -- the very first open would dump the current in-progress week into the backlog.
  if v_last is null then
    update user_state
      set last_rollover_on = p_today, updated_at = now()
      where user_id = v_uid;
    return 0;
  end if;

  v_last_monday := v_last - (extract(isodow from v_last)::int - 1);

  -- Same week as the last rollover (or a backwards clock) → nothing to do.
  if v_this_monday <= v_last_monday then
    return 0;
  end if;

  -- A new week has begun. Sweep every open day-bucket task into the backlog,
  -- above the existing backlog, preserving relative order (day order, then
  -- position within the day). Positions land in [v_base - n, v_base - 1] so the
  -- swept group sorts above whatever is already in the backlog.
  select coalesce(min(position), 0) into v_base
    from tasks
    where user_id = v_uid and bucket = 'backlog';

  with swept as (
    select id,
           row_number() over (
             order by array_position(
                        array['mon','tue','wed','thu','fri','sat','sun']::task_bucket[],
                        bucket),
                      position
           ) as rn,
           count(*) over () as n
      from tasks
      where user_id = v_uid
        and bucket <> 'backlog'
        and done = false
  )
  update tasks t
    set bucket = 'backlog',
        date = null,
        position = v_base - (swept.n - swept.rn + 1)
    from swept
    where t.id = swept.id;

  get diagnostics v_swept = row_count;

  update user_state
    set last_rollover_on = p_today, updated_at = now()
    where user_id = v_uid;

  return v_swept;
end $$;

grant execute on function rollover_week(date) to authenticated;
