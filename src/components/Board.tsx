import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { supabase } from '../lib/supabase'
import type { Bucket, Task } from '../lib/types'
import {
  ALL_BUCKETS,
  weekDates,
  todayBucket,
  weekRangeLabel,
} from '../lib/buckets'
import { between, canonicalSort } from '../lib/position'
import { openShade } from '../lib/shading'
import {
  fetchTasks,
  addTask,
  setDone,
  moveTask,
  deleteTask,
  renameTask,
} from '../data/tasks'
import { DaySection } from './DaySection'
import { TaskCard } from './TaskCard'
import { ConfirmDialog } from './ConfirmDialog'
import { TaskSheet } from './TaskSheet'

export function Board({ session }: { session: Session }) {
  const userId = session.user.id
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<Bucket>>(new Set())
  const [activeId, setActiveId] = useState<string | null>(null)
  // The × is a small target on a phone; deletion is confirmed before it lands.
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null)
  // The bucket a new task is being composed for, or null when the sheet is shut.
  const [addingTo, setAddingTo] = useState<Bucket | null>(null)
  // The task whose name is being edited, or null when the sheet is shut.
  const [editing, setEditing] = useState<Task | null>(null)

  const dates = useMemo(() => weekDates(), [])
  const today = useMemo(() => todayBucket(), [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Touch: long-press to lift, so a scroll gesture is not hijacked.
    useSensor(TouchSensor, {
      activationConstraint: { delay: 220, tolerance: 6 },
    }),
  )

  useEffect(() => {
    // Collapse everything except today on first load.
    setCollapsed(new Set(ALL_BUCKETS.filter((b) => b !== today)))
    fetchTasks()
      .then(setTasks)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [today])

  const byBucket = useMemo(() => {
    const map = {} as Record<Bucket, Task[]>
    for (const b of ALL_BUCKETS) map[b] = []
    for (const t of tasks) map[t.bucket].push(t)
    for (const b of ALL_BUCKETS) map[b].sort(canonicalSort)
    return map
  }, [tasks])

  const weekPct = useMemo(() => {
    const dayTasks = tasks.filter((t) => t.bucket !== 'backlog')
    if (dayTasks.length === 0) return 0
    return Math.round(
      (dayTasks.filter((t) => t.done).length / dayTasks.length) * 100,
    )
  }, [tasks])

  function upsertLocal(updated: Task) {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
  }

  async function handleAdd(bucket: Bucket, title: string) {
    setAddingTo(null)
    // A task added to a collapsed section would land out of sight.
    setCollapsed((prev) => {
      if (!prev.has(bucket)) return prev
      const next = new Set(prev)
      next.delete(bucket)
      return next
    })
    try {
      const task = await addTask({
        userId,
        title,
        bucket,
        date: dates[bucket],
        siblings: byBucket[bucket],
      })
      setTasks((prev) => [...prev, task])
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleToggle(task: Task) {
    try {
      const updated = await setDone(task, !task.done, byBucket[task.bucket])
      upsertLocal(updated)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleRename(task: Task, title: string) {
    setEditing(null)
    const prev = task
    upsertLocal({ ...task, title })
    try {
      upsertLocal(await renameTask(task.id, title))
    } catch (e) {
      upsertLocal(prev)
      setError((e as Error).message)
    }
  }

  async function handleDelete(task: Task) {
    setPendingDelete(null)
    const prev = tasks
    setTasks((p) => p.filter((t) => t.id !== task.id))
    try {
      await deleteTask(task.id)
    } catch (e) {
      setTasks(prev)
      setError((e as Error).message)
    }
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(e.active.id as string)
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const { active, over } = e
    if (!over) return
    const activeTask = tasks.find((t) => t.id === active.id)
    if (!activeTask || activeTask.done) return

    // Resolve the target bucket from either a section droppable or a task.
    const overId = String(over.id)
    let targetBucket: Bucket
    let overTask: Task | undefined
    if (overId.startsWith('bucket:')) {
      targetBucket = overId.slice('bucket:'.length) as Bucket
    } else {
      overTask = tasks.find((t) => t.id === overId)
      if (!overTask) return
      targetBucket = overTask.bucket
    }

    const openList = byBucket[targetBucket]
      .filter((t) => !t.done && t.id !== activeTask.id)

    // Insert above the over-task, or append when dropped on empty area.
    let idx = openList.length
    if (overTask && !overTask.done) {
      idx = openList.findIndex((t) => t.id === overTask!.id)
      if (idx < 0) idx = openList.length
    }
    const above = openList[idx - 1]?.position
    const below = openList[idx]?.position

    if (
      targetBucket === activeTask.bucket &&
      below === undefined &&
      above === activeTask.position
    ) {
      return // dropped back in place
    }

    const date = targetBucket === 'backlog' ? null : dates[targetBucket]
    const pos = between(above, below)

    if (pos !== null) {
      const updated = { ...activeTask, bucket: targetBucket, date, position: pos }
      upsertLocal(updated)
      try {
        const saved = await moveTask(activeTask.id, targetBucket, date, pos)
        upsertLocal(saved)
      } catch (err) {
        setError((err as Error).message)
        fetchTasks().then(setTasks).catch(() => {})
      }
      return
    }

    // Precision collapse: renumber the target bucket 0,1,2,… with active inserted.
    const rebuilt = [...openList]
    rebuilt.splice(idx, 0, { ...activeTask, bucket: targetBucket, date })
    try {
      await Promise.all(
        rebuilt.map((t, i) =>
          moveTask(t.id, targetBucket, date, i).catch((err) => {
            throw err
          }),
        ),
      )
    } catch (err) {
      setError((err as Error).message)
    } finally {
      fetchTasks().then(setTasks).catch(() => {})
    }
  }

  function toggleCollapse(bucket: Bucket) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(bucket) ? next.delete(bucket) : next.add(bucket)
      return next
    })
  }

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null

  if (loading) return <p className="status">Loading…</p>

  return (
    <div className="board">
      <header className="app-header">
        <div>
          <h1 className="app-title">Orgo</h1>
          <p className="week-range">{weekRangeLabel()}</p>
        </div>
        <div className="week-pct-wrap">
          <span className="week-pct">{weekPct}%</span>
          <button
            className="signout"
            onClick={() => supabase.auth.signOut()}
            type="button"
          >
            Sign out
          </button>
        </div>
      </header>

      {error && <p className="board-error">{error}</p>}

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="sections">
          {ALL_BUCKETS.map((b) => (
            <DaySection
              key={b}
              bucket={b}
              tasks={byBucket[b]}
              isToday={b === today}
              collapsed={collapsed.has(b)}
              onToggleCollapse={toggleCollapse}
              onToggleTask={handleToggle}
              onDeleteTask={setPendingDelete}
              onEditTask={setEditing}
              onAdd={setAddingTo}
            />
          ))}
        </div>
        <DragOverlay>
          {activeTask ? (
            <TaskCard
              task={activeTask}
              shade={openShade(activeTask.bucket, 0, 1)}
              onToggle={() => {}}
              onDelete={() => {}}
              onEdit={() => {}}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {addingTo && (
        <TaskSheet
          bucket={addingTo}
          onSubmit={(title) => handleAdd(addingTo, title)}
          onCancel={() => setAddingTo(null)}
        />
      )}

      {editing && (
        <TaskSheet
          bucket={editing.bucket}
          initialTitle={editing.title}
          onSubmit={(title) => handleRename(editing, title)}
          onCancel={() => setEditing(null)}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this task?"
          body={`“${pendingDelete.title}” will be removed permanently. This can’t be undone.`}
          confirmLabel="Delete"
          onConfirm={() => handleDelete(pendingDelete)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}
