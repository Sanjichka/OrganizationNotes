-- Orgo task start time ("when"). Apply after 0001–0004 in the Supabase SQL editor.
-- Source of truth: docs/data-model.md §1. Keep them in sync.
--
-- An optional clock time of day the task is planned for. It is a time only, with
-- no date of its own: a task's day is already its bucket, and a backlog task has
-- no day at all. So this is `time`, not `timestamptz` — "14:30", never a full
-- instant. Nullable, like duration_min: most tasks never get one.
--
-- It touches none of the invariants — not the canonical sort, not shading, not
-- carry-over. It is display metadata, exactly like duration_min.

alter table tasks
  add column start_time time;

-- Column-level access follows the table grants already on `tasks` (0001) and the
-- "own tasks" RLS policy, so no new grant or policy is needed.
