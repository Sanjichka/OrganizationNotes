-- Orgo initial schema. Apply once in the Supabase SQL editor.
-- Source of truth: docs/data-model.md. Keep them in sync.

-- 1. Schema ------------------------------------------------------------------

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

-- updated_at trigger ---------------------------------------------------------

create function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger tasks_touch
  before update on tasks
  for each row execute function touch_updated_at();

-- rollover bookkeeping -------------------------------------------------------

create table user_state (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  last_rollover_on  date,
  updated_at        timestamptz not null default now()
);

-- 2. Row-level security ------------------------------------------------------

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

-- 3. Grants ------------------------------------------------------------------
-- RLS sits on top of table-level grants: the policies decide which ROWS a user
-- sees, but the authenticated role still needs base access to the table. Row
-- scoping is enforced entirely by the policies above.

grant select, insert, update, delete on public.tasks      to authenticated;
grant select, insert, update, delete on public.user_state to authenticated;
