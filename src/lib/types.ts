export type Bucket =
  | 'mon'
  | 'tue'
  | 'wed'
  | 'thu'
  | 'fri'
  | 'sat'
  | 'sun'
  | 'backlog'

export interface Task {
  id: string
  user_id: string
  title: string
  bucket: Bucket
  date: string | null
  position: number
  done: boolean
  completed_at: string | null
  duration_min: number | null
  // Optional clock time of day ("when"), as HH:MM[:SS]. Display metadata only —
  // see docs/decisions.md D10.
  start_time: string | null
  tag: string | null
  created_at: string
  updated_at: string
}

// A task nested under another task, capped at one level. It has no bucket, date
// or shading of its own — it follows its parent by task_id — but otherwise holds
// the same user-facing fields a task does (duration, "when", completion), so a
// task can be dragged in and back out losslessly. See docs/decisions.md D9, D11.
export interface Subtask {
  id: string
  user_id: string
  task_id: string
  title: string
  position: number
  done: boolean
  completed_at: string | null
  duration_min: number | null
  start_time: string | null
  created_at: string
  updated_at: string
}
