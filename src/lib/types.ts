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
