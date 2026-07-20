import { supabase } from '../lib/supabase'
import type { Bucket, Task } from '../lib/types'
import { appendPosition } from '../lib/position'

// All queries rely on RLS to scope rows to the current user, so user_id is only
// needed on insert.

export async function fetchTasks(): Promise<Task[]> {
  const { data, error } = await supabase.from('tasks').select('*')
  if (error) throw error
  return data as Task[]
}

export async function addTask(args: {
  userId: string
  title: string
  bucket: Bucket
  date: string | null
  siblings: Task[]
  durationMin?: number | null
}): Promise<Task> {
  const { userId, title, bucket, date, siblings, durationMin } = args
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      user_id: userId,
      title: title.trim(),
      bucket,
      date,
      position: appendPosition(siblings),
      duration_min: durationMin ?? null,
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

export async function renameTask(taskId: string, title: string): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update({ title: title.trim() })
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
