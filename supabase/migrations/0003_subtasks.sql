-- Orgo subtasks. Apply after 0001/0002 in the Supabase SQL editor.
-- Source of truth: docs/data-model.md §6. Keep them in sync.
--
-- A subtask is a lightweight checklist item under a task — title, done, order.
-- It has NO bucket, date, duration or shading of its own, and no independent
-- carry-over: it references its parent by id, so it follows the parent for free
-- and touches none of the tasks invariants (see docs/decisions.md D9).

-- 1. Schema ------------------------------------------------------------------

create table subtasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  task_id       uuid not null references tasks(id) on delete cascade,

  title         text not null
                  check (length(btrim(title)) between 1 and 200),
  position      double precision not null,
  done          boolean not null default false,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Fetched and rendered per-parent, in position order.
create index subtasks_task_idx on subtasks (task_id, position);
-- Deleting a parent cascades; this keeps that cascade fast.
create index subtasks_user_idx on subtasks (user_id);

-- updated_at trigger (function defined in 0001) ------------------------------

create trigger subtasks_touch
  before update on subtasks
  for each row execute function touch_updated_at();

-- 2. Row-level security ------------------------------------------------------

alter table subtasks enable row level security;

create policy "own subtasks" on subtasks
  for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. Grants ------------------------------------------------------------------

grant select, insert, update, delete on public.subtasks to authenticated;
