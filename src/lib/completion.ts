import type { Subtask, Task } from './types'

// Flat-unit completion for the weekly review. Every subtask is its own unit,
// weighted the same as a standalone task; a task with NO subtasks is one unit,
// done iff the task is. The figure is simply doneUnits / totalUnits. So three
// tasks, one carrying three subtasks, is five units — completing a whole task
// and ticking one subtask move the needle equally. See docs/decisions.md D12.

export interface Units {
  done: number
  total: number
}

// One task's units. Subtasks, when present, replace the task as the countable
// items — which stays consistent with auto-complete (all boxes done ⇒ parent
// done), so a fully-checked task reads the same either way.
export function taskUnits(task: Task, subs: Subtask[] | undefined): Units {
  if (subs && subs.length > 0) {
    return { done: subs.filter((s) => s.done).length, total: subs.length }
  }
  return { done: task.done ? 1 : 0, total: 1 }
}

// Summed units across a set of top-level tasks.
export function tallyUnits(
  tasks: Task[],
  subtasksByTask: Record<string, Subtask[]>,
): Units {
  return tasks.reduce<Units>(
    (acc, t) => {
      const u = taskUnits(t, subtasksByTask[t.id])
      return { done: acc.done + u.done, total: acc.total + u.total }
    },
    { done: 0, total: 0 },
  )
}

// Flat-unit completion of a set of tasks as a whole percent. Empty set → 0.
export function completionPct(
  tasks: Task[],
  subtasksByTask: Record<string, Subtask[]>,
): number {
  const { done, total } = tallyUnits(tasks, subtasksByTask)
  return total ? Math.round((done / total) * 100) : 0
}

// Group subtasks under their parent task id, for the helpers above.
export function groupSubtasks(subtasks: Subtask[]): Record<string, Subtask[]> {
  const map: Record<string, Subtask[]> = {}
  for (const s of subtasks) (map[s.task_id] ??= []).push(s)
  return map
}
