-- Orgo migration 0009: the grant 0007 forgot.
--
-- `day_plan_override` shipped with RLS enabled and a correct "own plan
-- overrides" policy, but no table-level privileges — so every read of it failed
-- with "permission denied for table day_plan_override", and because the board
-- loads tasks, subtasks and overrides in one Promise.all, that one failure took
-- the whole board down with it.
--
-- RLS sits ON TOP of table grants: the policy decides which ROWS the user may
-- touch, but `authenticated` still needs base access to the table before the
-- policy is ever consulted. 0001 says this in as many words and grants tasks and
-- user_state; 0003 grants subtasks. 0007 created a table and did not. This is
-- the one line it was missing.

grant select, insert, update, delete on public.day_plan_override to authenticated;
