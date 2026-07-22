import { supabase } from '../lib/supabase'
import type { Bucket, Subtask, Task } from '../lib/types'
import { appendPosition } from '../lib/position'
import { todayISODate } from '../lib/buckets'

// All queries rely on RLS to scope rows to the current user, so user_id is only
// needed on insert.

export async function fetchTasks(): Promise<Task[]> {
  const { data, error } = await supabase.from('tasks').select('*')
  if (error) throw error
  return data as Task[]
}

// Weekly carry-over. On the first open of a new week the DB moves every open
// day-bucket task into the backlog (see supabase/migrations/0004). Idempotent —
// guarded by user_state.last_rollover_on — so calling it on every app open is
// safe. Returns the number of tasks swept (0 when the week already rolled over).
// "Today" is the client's LOCAL day so the week boundary follows the user's
// calendar, not the server's UTC clock (decisions.md D2).
export async function runWeeklyRollover(): Promise<number> {
  const { data, error } = await supabase.rpc('rollover_week', {
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

export async function moveTask(
  taskId: string,
  bucket: Bucket,
  date: string | null,
  position: number,
): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update({ bucket, date, position })
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
}): Promise<Subtask> {
  const { userId, taskId, title, siblings } = args
  const { data, error } = await supabase
    .from('subtasks')
    .insert({
      user_id: userId,
      task_id: taskId,
      title: title.trim(),
      position: appendPosition(siblings),
    })
    .select('*')
    .single()
  if (error) throw error
  return data as Subtask
}

export async function setSubtaskDone(id: string, done: boolean): Promise<Subtask> {
  const { data, error } = await supabase
    .from('subtasks')
    .update({ done })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as Subtask
}

export async function renameSubtask(id: string, title: string): Promise<Subtask> {
  const { data, error } = await supabase
    .from('subtasks')
    .update({ title: title.trim() })
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
