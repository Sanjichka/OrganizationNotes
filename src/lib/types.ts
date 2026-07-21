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
  tag: string | null
  created_at: string
  updated_at: string
}

// A lightweight checklist item under a task. No bucket/date/shading of its own —
// it follows its parent by task_id. See docs/decisions.md D9.
export interface Subtask {
  id: string
  user_id: string
  task_id: string
  title: string
  position: number
  done: boolean
  created_at: string
  updated_at: string
}
