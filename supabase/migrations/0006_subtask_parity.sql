-- Orgo subtask ↔ task parity. Apply after 0001–0005 in the Supabase SQL editor.
-- Source of truth: docs/data-model.md §6 and docs/decisions.md D11. Keep in sync.
--
-- D9 shipped subtasks as a bare checklist (title, done, position). D11 revises
-- that: a subtask can now be dragged into a task and back, so it must be able to
-- hold everything a task holds without losing data on the round-trip. These three
-- columns mirror `tasks` exactly — duration_min (0001), start_time (0005), and a
-- completion timestamp.
--
-- What does NOT change: a subtask still has no bucket, date or shading (it follows
-- its parent), and it still never feeds the weekly review. `completed_at` exists
-- only so a done subtask promoted back to a task keeps its timestamp, and so the
-- done-toggle mirrors a task's. Subtasks are still shown in plain `position asc`.

alter table subtasks
  add column duration_min integer check (duration_min > 0),
  add column start_time   time,
  add column completed_at timestamptz;

-- Column-level access follows the table grants already on `subtasks` (0003) and
-- the "own subtasks" RLS policy, so no new grant or policy is needed.
