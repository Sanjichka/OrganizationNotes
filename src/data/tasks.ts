import { supabase } from '../lib/supabase'
import type { Bucket, DayPlanOverride, Subtask, Task } from '../lib/types'
import { appendPosition } from '../lib/position'
import { todayISODate } from '../lib/buckets'

// All queries rely on RLS to scope rows to the current user, so user_id is only
// needed on insert.

export async function fetchTasks(): Promise<Task[]> {
  const { data, error } = await supabase.from('tasks').select('*')
  if (error) throw error
  return data as Task[]
}

// Nightly carry-over. For every day boundary crossed since the last run, the DB
// moves that day's still-open tasks into the next day — and Sunday's into the
// backlog (see supabase/migrations/0007). A part-done checklist splits rather
// than moving whole. Idempotent — guarded by user_state.last_rollover_on — so
// calling it on every app open is safe. Returns the number of tasks carried.
// "Today" is the client's LOCAL day so the boundary follows the user's midnight,
// not the server's UTC clock (decisions.md D2).
export async function runDailyRollover(): Promise<number> {
  const { data, error } = await supabase.rpc('rollover_days', {
    p_today: todayISODate(),
  })
  if (error) throw error
  return (data as number) ?? 0
}

export async function addTask(args: {
  userId: string
  title: string
  bucket: Bucket
  date: string | null
  siblings: Task[]
  durationMin?: number | null
  startTime?: string | null
}): Promise<Task> {
  const { userId, title, bucket, date, siblings, durationMin, startTime } = args
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      user_id: userId,
      title: title.trim(),
      bucket,
      date,
      position: appendPosition(siblings),
      duration_min: durationMin ?? null,
      start_time: startTime || null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as Task
}

export async function setDone(task: Task, done: boolean, siblings: Task[]): Promise<Task> {
  // Completing drops the task to the bottom of its bucket; un-completing returns
  // it to the bottom of the OPEN section. Either way we recompute a position.
  const openSiblings = siblings.filter((t) => t.id !== task.id && !t.done)
  const patch = done
    ? { done: true, completed_at: new Date().toISOString() }
    : { done: false, completed_at: null, position: appendPosition(openSiblings) }
  const { data, error } = await supabase
    .from('tasks')
    .update(patch)
    .eq('id', task.id)
    .select('*')
    .single()
  if (error) throw error
  return data as Task
}

// Edit a task's user-facing fields in one write. Every field is optional: only
// the keys present in `patch` are sent, so `updateTask(id, { title })` is still a
// pure rename. duration_min / start_time accept null to clear the field.
export async function updateTask(
  taskId: string,
  patch: { title?: string; durationMin?: number | null; startTime?: string | null },
): Promise<Task> {
  const row: Record<string, unknown> = {}
  if (patch.title !== undefined) row.title = patch.title.trim()
  if (patch.durationMin !== undefined) row.duration_min = patch.durationMin
  if (patch.startTime !== undefined) row.start_time = patch.startTime || null
  const { data, error } = await supabase
    .from('tasks')
    .update(row)
    .eq('id', taskId)
    .select('*')
    .single()
  if (error) throw error
  return data as Task
}

// A deliberate move by the user, so it is a REPLAN: planned_date follows the
// destination. This is the one write that rewrites provenance — carry-over
// never does, which is what lets the review keep a day's denominator after its
// leftovers cascade onward (decisions.md D13).
export async function moveTask(
  taskId: string,
  bucket: Bucket,
  date: string | null,
  position: number,
): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update({ bucket, date, position, planned_date: date })
    .eq('id', taskId)
    .select('*')
    .single()
  if (error) throw error
  return data as Task
}

// Renumber one task in place, for the precision-collapse rebalance. Position
// only: a task whose neighbours were renumbered has not been moved or replanned,
// so neither its bucket nor its planned_date may be touched.
export async function renumberTask(taskId: string, position: number): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update({ position })
    .eq('id', taskId)
    .select('*')
    .single()
  if (error) throw error
  return data as Task
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
}

// Plan overrides --------------------------------------------------------------
// A manual correction to one day's planned total on the review, keyed by the
// plan date. Absent row = use the derived figure. Only the denominator is
// overridable; see decisions.md D13.

export async function fetchPlanOverrides(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('day_plan_override').select('*')
  if (error) throw error
  const map: Record<string, number> = {}
  for (const row of data as DayPlanOverride[]) map[row.plan_date] = row.planned_total
  return map
}

export async function setPlanOverride(
  userId: string,
  planDate: string,
  plannedTotal: number,
): Promise<void> {
  const { error } = await supabase
    .from('day_plan_override')
    .upsert(
      { user_id: userId, plan_date: planDate, planned_total: plannedTotal },
      { onConflict: 'user_id,plan_date' },
    )
  if (error) throw error
}

// Drop the correction and fall back to the derived total.
export async function clearPlanOverride(planDate: string): Promise<void> {
  const { error } = await supabase
    .from('day_plan_override')
    .delete()
    .eq('plan_date', planDate)
  if (error) throw error
}

// Subtasks --------------------------------------------------------------------
// Lightweight checklist items scoped to a parent by task_id. RLS scopes rows to
// the user, so user_id is only needed on insert. Deleting a task cascades to its
// subtasks in the database (0003), so no client-side cleanup is required.

export async function fetchSubtasks(): Promise<Subtask[]> {
  const { data, error } = await supabase.from('subtasks').select('*')
  if (error) throw error
  return data as Subtask[]
}

export async function addSubtask(args: {
  userId: string
  taskId: string
  title: string
  siblings: Subtask[]
  durationMin?: number | null
  startTime?: string | null
}): Promise<Subtask> {
  const { userId, taskId, title, siblings, durationMin, startTime } = args
  const { data, error } = await supabase
    .from('subtasks')
    .insert({
      user_id: userId,
      task_id: taskId,
      title: title.trim(),
      position: appendPosition(siblings),
      duration_min: durationMin ?? null,
      start_time: startTime || null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as Subtask
}

// Done also stamps completed_at, mirroring setDone. A subtask's done state feeds
// the weekly review as its own unit (decisions.md D12); the timestamp survives if
// it is later promoted to a task.
export async function setSubtaskDone(id: string, done: boolean): Promise<Subtask> {
  const patch = done
    ? { done: true, completed_at: new Date().toISOString() }
    : { done: false, completed_at: null }
  const { data, error } = await supabase
    .from('subtasks')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as Subtask
}

// Edit a subtask's user-facing fields in one write. Present-keys-only, exactly
// like updateTask; duration_min / start_time accept null to clear the field.
export async function updateSubtask(
  id: string,
  patch: { title?: string; durationMin?: number | null; startTime?: string | null },
): Promise<Subtask> {
  const row: Record<string, unknown> = {}
  if (patch.title !== undefined) row.title = patch.title.trim()
  if (patch.durationMin !== undefined) row.duration_min = patch.durationMin
  if (patch.startTime !== undefined) row.start_time = patch.startTime || null
  const { data, error } = await supabase
    .from('subtasks')
    .update(row)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as Subtask
}

// Reorder within a parent, or re-parent into another task's checklist — both are
// one row: task_id + a fresh fractional position. Never renumbers siblings.
export async function moveSubtask(
  id: string,
  taskId: string,
  position: number,
): Promise<Subtask> {
  const { data, error } = await supabase
    .from('subtasks')
    .update({ task_id: taskId, position })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as Subtask
}

export async function deleteSubtask(id: string): Promise<void> {
  const { error } = await supabase.from('subtasks').delete().eq('id', id)
  if (error) throw error
}

// Cross-table conversions. There is no server-side transaction here: we insert
// the new row, then delete the old one (offline is read-only, so no write queue
// to reconcile). The same insert-then-delete shape the rebalance path uses.

// A task becomes a subtask of `parentId`. Only ever called for an open, childless
// task (Board guards this), so done is false and completed_at null in practice —
// but we carry them through so the mapping is total and future-proof.
export async function taskToSubtask(
  task: Task,
  parentId: string,
  position: number,
): Promise<Subtask> {
  const { data, error } = await supabase
    .from('subtasks')
    .insert({
      user_id: task.user_id,
      task_id: parentId,
      title: task.title,
      position,
      done: task.done,
      completed_at: task.completed_at,
      duration_min: task.duration_min,
      start_time: task.start_time,
    })
    .select('*')
    .single()
  if (error) throw error
  await deleteTask(task.id)
  return data as Subtask
}

// A subtask is promoted to a full task in `bucket` (date null for the backlog).
export async function subtaskToTask(
  subtask: Subtask,
  bucket: Bucket,
  date: string | null,
  position: number,
): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      user_id: subtask.user_id,
      title: subtask.title,
      bucket,
      date,
      position,
      done: subtask.done,
      completed_at: subtask.completed_at,
      duration_min: subtask.duration_min,
      start_time: subtask.start_time,
    })
    .select('*')
    .single()
  if (error) throw error
  await deleteSubtask(subtask.id)
  return data as Task
}
