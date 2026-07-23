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

// The week's review ----------------------------------------------------------
// Counted by planned_date, NOT by the bucket a task currently sits in. Once the
// nightly cascade moves Wednesday's leftovers to Thursday, counting by bucket
// leaves Wednesday reading 3/3 when it was 3 of 5 — the day's numerator survives
// in completed_at but its denominator does not. planned_date is that missing
// denominator: carry-over never rewrites it, only a deliberate move does.
// See docs/decisions.md D13.

/** The tasks planned for one day, wherever they have since ended up. */
export function plannedOn(tasks: Task[], date: string): Task[] {
  return tasks.filter((t) => t.planned_date === date)
}

export interface DayUnits extends Units {
  date: string
  pct: number
  /** `total` came from a manual correction rather than the rows. */
  overridden: boolean
}

/**
 * One day's figure. `total` is the derived unit count unless the user has
 * corrected it. A correction below the done count would push past 100%, so the
 * percentage is clamped — the label still shows what was typed.
 */
function dayUnits(
  tasks: Task[],
  subtasksByTask: Record<string, Subtask[]>,
  date: string,
  override: number | undefined,
): DayUnits {
  const { done, total } = tallyUnits(plannedOn(tasks, date), subtasksByTask)
  const shown = override ?? total
  return {
    date,
    done,
    total: shown,
    overridden: override !== undefined,
    pct: shown ? Math.min(100, Math.round((done / shown) * 100)) : 0,
  }
}

/**
 * The canonical week figure: per-day units plus the roll-up. Both the header
 * percentage and the whole Review screen read this, so no two numbers on screen
 * can tell different stories (decisions.md D12).
 */
export function weekReview(
  tasks: Task[],
  subtasksByTask: Record<string, Subtask[]>,
  dates: string[],
  overrides: Record<string, number> = {},
): { days: DayUnits[]; done: number; total: number; pct: number } {
  const days = dates.map((d) => dayUnits(tasks, subtasksByTask, d, overrides[d]))
  const done = days.reduce((n, d) => n + d.done, 0)
  const total = days.reduce((n, d) => n + d.total, 0)
  return {
    days,
    done,
    total,
    pct: total ? Math.min(100, Math.round((done / total) * 100)) : 0,
  }
}

// Group subtasks under their parent task id, for the helpers above.
export function groupSubtasks(subtasks: Subtask[]): Record<string, Subtask[]> {
  const map: Record<string, Subtask[]> = {}
  for (const s of subtasks) (map[s.task_id] ??= []).push(s)
  return map
}
