import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import type { Bucket, Subtask, Task } from '../lib/types'
import { ALL_BUCKETS, weekDates, todayBucket } from '../lib/buckets'
import { arrayMove } from '@dnd-kit/sortable'
import { appendPosition, between, canonicalSort } from '../lib/position'
import { openShade } from '../lib/shading'
import {
  fetchTasks,
  runWeeklyRollover,
  addTask,
  setDone,
  moveTask,
  deleteTask,
  updateTask,
  fetchSubtasks,
  addSubtask,
  setSubtaskDone,
  updateSubtask,
  moveSubtask,
  taskToSubtask,
  subtaskToTask,
  deleteSubtask,
} from '../data/tasks'
import { DaySection } from './DaySection'
import { TaskCard } from './TaskCard'
import { ConfirmDialog } from './ConfirmDialog'
import { TaskSheet, type TaskDraft } from './TaskSheet'
import { formatTime } from '../lib/duration'
import { AppHeader } from './AppHeader'
import { type Page } from './Tabs'

// Drag id namespaces shared across one DndContext: subtasks are `sub:<uuid>`,
// day droppables are `bucket:<bucket>`, task sortables are the raw uuid.
const isSubId = (id: string) => id.startsWith('sub:')
const rawSubId = (id: string) => id.slice('sub:'.length)
const isBucketId = (id: string) => id.startsWith('bucket:')

// Resolve the drag's `over` to a specific card/subtask, not the day it sits in.
// Each day's section-body is a droppable spanning the whole column, so a drag that
// isn't strictly inside a sibling card — most importantly the hole left behind by
// the lifted card — falls through to the day, and nesting never gets a card to
// target (its centre-band test never runs). So:
//   1. prefer a card the finger is genuinely *inside* (precise), else
//   2. the *nearest* card by centre (forgiving — covers the lifted card's hole and
//      the gaps between cards), else
//   3. the day droppable itself (an empty or collapsed day, with no card in range).
// The active card is never its own target.
const nestAwareCollision: CollisionDetection = (args) => {
  const activeId = String(args.active.id)
  const isCard = (c: { id: string | number }) =>
    String(c.id) !== activeId && !isBucketId(String(c.id))
  const within = pointerWithin(args)
  const nearest = closestCenter(args)
  const card = within.find(isCard) ?? nearest.find(isCard)
  if (card) return [card]
  return within.length ? within : nearest
}

// The pointer's viewport Y during a drag, from the activator (pointer/touch)
// event plus the live drag delta. Null for a keyboard activator, which has no
// coordinates. This is the finger, not the dragged card — the card's own centre
// drifts with where it was grabbed and is shoved around by the sortable's live
// reorder, so it makes a treacherous nest target.
function dragPointerY(e: DragOverEvent | DragEndEvent): number | null {
  const a = e.activatorEvent as Partial<PointerEvent & TouchEvent>
  const startY =
    typeof a?.clientY === 'number'
      ? a.clientY
      : (a?.touches?.[0]?.clientY ?? a?.changedTouches?.[0]?.clientY)
  return startY == null ? null : startY + e.delta.y
}

// A drag nests into a task when the POINTER sits in the middle band of the target
// card (or over that card's checklist). Keyed off the finger, not the dragged
// card, so it doesn't fight the reorder shuffle. Near the top/bottom edge it stays
// a plain reorder — the edge-vs-centre split is the whole nest/reorder disambig.
function inCentreBand(
  py: number | null,
  over: { top: number; height: number } | null | undefined,
): boolean {
  if (py == null || !over) return false
  return py > over.top + over.height * 0.25 && py < over.top + over.height * 0.75
}

export function Board({
  session,
  page,
  onChange,
  onOpenProfile,
}: {
  session: Session
  page: Page
  onChange: (p: Page) => void
  onOpenProfile: () => void
}) {
  const userId = session.user.id
  const [tasks, setTasks] = useState<Task[]>([])
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<Bucket>>(new Set())
  const [activeId, setActiveId] = useState<string | null>(null)
  // The task a dragged task/subtask would nest into, for the drop-target ring.
  const [nestingId, setNestingId] = useState<string | null>(null)
  // The × is a small target on a phone; deletion is confirmed before it lands.
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null)
  // Same for a subtask's × — confirm before the row is gone.
  const [pendingDeleteSubtask, setPendingDeleteSubtask] = useState<Subtask | null>(null)
  // The bucket a new task is being composed for, or null when the sheet is shut.
  const [addingTo, setAddingTo] = useState<Bucket | null>(null)
  // The task whose name is being edited, or null when the sheet is shut.
  const [editing, setEditing] = useState<Task | null>(null)
  // The task a new subtask is being composed for, via the shared task sheet.
  const [addingSubtaskTo, setAddingSubtaskTo] = useState<Task | null>(null)
  // The subtask being edited, or null when that sheet is shut.
  const [editingSubtask, setEditingSubtask] = useState<Subtask | null>(null)

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
    // Weekly carry-over runs first so the fetch below reflects any sweep. It is
    // idempotent, and a failure (e.g. offline — writes don't run offline) must
    // not block the board, so we swallow it and load whatever we can read.
    runWeeklyRollover()
      .catch(() => 0)
      .then(() => Promise.all([fetchTasks(), fetchSubtasks()]))
      .then(([t, s]) => {
        setTasks(t)
        setSubtasks(s)
      })
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

  const subtasksByTask = useMemo(() => {
    const map: Record<string, Subtask[]> = {}
    for (const s of subtasks) (map[s.task_id] ??= []).push(s)
    for (const id in map) map[id].sort((a, b) => a.position - b.position)
    return map
  }, [subtasks])

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

  async function handleAdd(bucket: Bucket, draft: TaskDraft) {
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
        title: draft.title,
        bucket,
        date: dates[bucket],
        siblings: byBucket[bucket],
        durationMin: draft.durationMin,
        startTime: draft.startTime,
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

  async function handleEdit(task: Task, draft: TaskDraft) {
    setEditing(null)
    const prev = task
    upsertLocal({
      ...task,
      title: draft.title,
      duration_min: draft.durationMin,
      start_time: draft.startTime,
    })
    try {
      upsertLocal(
        await updateTask(task.id, {
          title: draft.title,
          durationMin: draft.durationMin,
          startTime: draft.startTime,
        }),
      )
    } catch (e) {
      upsertLocal(prev)
      setError((e as Error).message)
    }
  }

  async function handleDelete(task: Task) {
    setPendingDelete(null)
    const prevTasks = tasks
    const prevSubtasks = subtasks
    setTasks((p) => p.filter((t) => t.id !== task.id))
    // The DB cascades subtasks on parent delete; mirror that locally.
    setSubtasks((p) => p.filter((s) => s.task_id !== task.id))
    try {
      await deleteTask(task.id)
    } catch (e) {
      setTasks(prevTasks)
      setSubtasks(prevSubtasks)
      setError((e as Error).message)
    }
  }

  function upsertSubtaskLocal(updated: Subtask) {
    setSubtasks((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
  }

  // Auto-complete: all boxes done → parent done; any box open → parent reopened.
  // A parent with zero subtasks has no auto behaviour (D9). Callers pass the list
  // AFTER their own mutation, so this reads the new state rather than a stale one.
  async function reconcileParentDone(parent: Task | undefined, list: Subtask[]) {
    if (!parent || list.length === 0) return
    const allDone = list.every((s) => s.done)
    if (allDone && !parent.done) {
      upsertLocal(await setDone(parent, true, byBucket[parent.bucket]))
    } else if (!allDone && parent.done) {
      upsertLocal(await setDone(parent, false, byBucket[parent.bucket]))
    }
  }

  async function handleAddSubtask(task: Task, draft: TaskDraft) {
    setAddingSubtaskTo(null)
    const siblings = subtasksByTask[task.id] ?? []
    try {
      const created = await addSubtask({
        userId,
        taskId: task.id,
        title: draft.title,
        siblings,
        durationMin: draft.durationMin,
        startTime: draft.startTime,
      })
      setSubtasks((prev) => [...prev, created])
      // Adding open work to a finished task reopens it (auto-complete symmetry).
      if (task.done) {
        upsertLocal(await setDone(task, false, byBucket[task.bucket]))
      }
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleEditSubtask(subtask: Subtask, draft: TaskDraft) {
    setEditingSubtask(null)
    const prev = subtask
    upsertSubtaskLocal({
      ...subtask,
      title: draft.title,
      duration_min: draft.durationMin,
      start_time: draft.startTime,
    })
    try {
      upsertSubtaskLocal(
        await updateSubtask(subtask.id, {
          title: draft.title,
          durationMin: draft.durationMin,
          startTime: draft.startTime,
        }),
      )
    } catch (e) {
      upsertSubtaskLocal(prev)
      setError((e as Error).message)
    }
  }

  async function handleToggleSubtask(subtask: Subtask) {
    const nextDone = !subtask.done
    const prev = subtask
    upsertSubtaskLocal({ ...subtask, done: nextDone })
    try {
      upsertSubtaskLocal(await setSubtaskDone(subtask.id, nextDone))
      // Checking the last box finishes the parent; unchecking one reopens it.
      const parent = tasks.find((t) => t.id === subtask.task_id)
      const list = (subtasksByTask[parent?.id ?? ''] ?? []).map((s) =>
        s.id === subtask.id ? { ...s, done: nextDone } : s,
      )
      await reconcileParentDone(parent, list)
    } catch (e) {
      upsertSubtaskLocal(prev)
      setError((e as Error).message)
    }
  }

  async function handleDeleteSubtask(subtask: Subtask) {
    setPendingDeleteSubtask(null)
    const prev = subtasks
    setSubtasks((p) => p.filter((s) => s.id !== subtask.id))
    try {
      await deleteSubtask(subtask.id)
    } catch (e) {
      setSubtasks(prev)
      setError((e as Error).message)
    }
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(e.active.id as string)
  }

  // Which task a drag would nest into (a task becoming a subtask, or a subtask
  // re-parenting), or null for a plain reorder/move. Shared by drag-over (to
  // paint the ring) and drag-end (to act). Enforces the nesting guards.
  function nestTarget(e: DragOverEvent | DragEndEvent): string | null {
    const { active, over } = e
    if (!over) return null
    const overId = String(over.id)
    const activeStr = String(active.id)

    // Candidate parent, plus whether being "over" it already means the checklist
    // zone (a subtask row) or still needs the centre-band test (a task card).
    let parentId: string | null = null
    let needBand = true
    if (isSubId(overId)) {
      const overSub = subtasks.find((s) => s.id === rawSubId(overId))
      if (!overSub) return null
      parentId = overSub.task_id
      needBand = false
    } else if (!isBucketId(overId)) {
      parentId = overId
    }
    if (!parentId) return null

    if (isSubId(activeStr)) {
      const sub = subtasks.find((s) => s.id === rawSubId(activeStr))
      if (!sub || sub.task_id === parentId) return null // same list = reorder
    } else {
      // A task nests only if it is itself open and childless (no grandchildren),
      // and not dropped on itself.
      if (parentId === activeStr) return null
      const task = tasks.find((t) => t.id === activeStr)
      if (!task || task.done) return null
      if ((subtasksByTask[task.id] ?? []).length > 0) return null
    }

    if (needBand && !inCentreBand(dragPointerY(e), over.rect)) {
      return null
    }
    return parentId
  }

  function handleDragOver(e: DragOverEvent) {
    setNestingId(nestTarget(e))
  }

  // A task is dropped onto another card's body → it becomes that card's subtask.
  async function nestTaskUnder(task: Task, parentId: string) {
    const pos = appendPosition(subtasksByTask[parentId] ?? [])
    try {
      const created = await taskToSubtask(task, parentId, pos)
      setTasks((p) => p.filter((t) => t.id !== task.id))
      setSubtasks((p) => [...p, created])
      await reconcileParentDone(tasks.find((t) => t.id === parentId), [
        ...(subtasksByTask[parentId] ?? []),
        created,
      ])
    } catch (e) {
      setError((e as Error).message)
      reloadAll()
    }
  }

  // A subtask reorders in its own list, re-parents onto another task, or is
  // promoted onto a day — resolved from the drop target and the nest test.
  async function handleSubtaskDrop(
    sub: Subtask,
    over: DragEndEvent['over'],
    nestId: string | null,
  ) {
    if (!over) return
    const overId = String(over.id)

    if (nestId) {
      // Re-parent into another task's checklist (one row: new task_id + pos).
      const oldParentId = sub.task_id
      const pos = appendPosition(subtasksByTask[nestId] ?? [])
      try {
        const moved = await moveSubtask(sub.id, nestId, pos)
        upsertSubtaskLocal(moved)
        await reconcileParentDone(
          tasks.find((t) => t.id === oldParentId),
          (subtasksByTask[oldParentId] ?? []).filter((s) => s.id !== sub.id),
        )
        await reconcileParentDone(tasks.find((t) => t.id === nestId), [
          ...(subtasksByTask[nestId] ?? []),
          moved,
        ])
      } catch (e) {
        setError((e as Error).message)
        reloadAll()
      }
      return
    }

    if (isSubId(overId)) {
      const overSub = subtasks.find((s) => s.id === rawSubId(overId))
      if (overSub && overSub.task_id === sub.task_id) await reorderSubtask(sub, overSub.id)
      return
    }

    await promoteSubtask(sub, overId)
  }

  async function reorderSubtask(sub: Subtask, overId: string) {
    const list = subtasksByTask[sub.task_id] ?? []
    const oldIndex = list.findIndex((s) => s.id === sub.id)
    const newIndex = list.findIndex((s) => s.id === overId)
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return
    // Compute the resulting order first, then read the dragged row's new
    // neighbours. "Insert above the drop target" can never reach the final slot
    // (dropping on the last row lands you second-to-last); arrayMove can.
    const reordered = arrayMove(list, oldIndex, newIndex)
    const at = reordered.findIndex((s) => s.id === sub.id)
    const pos = between(reordered[at - 1]?.position, reordered[at + 1]?.position)
    if (pos === null) {
      // Precision collapse (vanishingly rare in a checklist): renumber 0,1,2,….
      try {
        const saved = await Promise.all(
          reordered.map((s, i) => moveSubtask(s.id, sub.task_id, i)),
        )
        setSubtasks((prev) => prev.map((s) => saved.find((x) => x.id === s.id) ?? s))
      } catch (e) {
        setError((e as Error).message)
      }
      return
    }
    const prev = sub
    upsertSubtaskLocal({ ...sub, position: pos })
    try {
      upsertSubtaskLocal(await moveSubtask(sub.id, sub.task_id, pos))
    } catch (e) {
      upsertSubtaskLocal(prev)
      setError((e as Error).message)
    }
  }

  // A subtask dropped on a day (or between that day's tasks) becomes a task.
  async function promoteSubtask(sub: Subtask, overId: string) {
    let bucket: Bucket
    let overTask: Task | undefined
    if (isBucketId(overId)) {
      bucket = overId.slice('bucket:'.length) as Bucket
    } else {
      overTask = tasks.find((t) => t.id === overId)
      if (!overTask) return
      bucket = overTask.bucket
    }
    const openList = byBucket[bucket].filter((t) => !t.done)
    let idx = openList.length
    if (overTask && !overTask.done) {
      idx = openList.findIndex((t) => t.id === overTask!.id)
      if (idx < 0) idx = openList.length
    }
    const pos = between(openList[idx - 1]?.position, openList[idx]?.position)
    if (pos === null) return // precision collapse: bail rather than renumber a day
    const date = bucket === 'backlog' ? null : dates[bucket]
    const oldParentId = sub.task_id
    try {
      const created = await subtaskToTask(sub, bucket, date, pos)
      setSubtasks((p) => p.filter((s) => s.id !== sub.id))
      setTasks((p) => [...p, created])
      await reconcileParentDone(
        tasks.find((t) => t.id === oldParentId),
        (subtasksByTask[oldParentId] ?? []).filter((s) => s.id !== sub.id),
      )
    } catch (e) {
      setError((e as Error).message)
      reloadAll()
    }
  }

  function reloadAll() {
    Promise.all([fetchTasks(), fetchSubtasks()])
      .then(([t, s]) => {
        setTasks(t)
        setSubtasks(s)
      })
      .catch(() => {})
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveId(null)
    setNestingId(null)
    const { active, over } = e
    if (!over) return
    const nestId = nestTarget(e)

    // A subtask drag: reorder, re-parent, or promote to a task.
    if (isSubId(String(active.id))) {
      const sub = subtasks.find((s) => s.id === rawSubId(String(active.id)))
      if (sub) await handleSubtaskDrop(sub, over, nestId)
      return
    }

    const activeTask = tasks.find((t) => t.id === active.id)
    if (!activeTask || activeTask.done) return

    // A task dropped on another card's body becomes its subtask.
    if (nestId) {
      await nestTaskUnder(activeTask, nestId)
      return
    }

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

  const activeTask =
    activeId && !isSubId(activeId) ? tasks.find((t) => t.id === activeId) : null
  const activeSubtask =
    activeId && isSubId(activeId)
      ? subtasks.find((s) => s.id === rawSubId(activeId))
      : null
  const subtaskParentBucket = (s: Subtask): Bucket =>
    tasks.find((t) => t.id === s.task_id)?.bucket ?? 'backlog'

  if (loading) return <p className="status">Loading…</p>

  return (
    <div className="board">
      <AppHeader
        user={session.user}
        weekPct={weekPct}
        page={page}
        onChange={onChange}
        onOpenProfile={onOpenProfile}
      />

      {error && <p className="board-error">{error}</p>}

      <DndContext
        sensors={sensors}
        collisionDetection={nestAwareCollision}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="sections">
          {ALL_BUCKETS.map((b) => (
            <DaySection
              key={b}
              bucket={b}
              tasks={byBucket[b]}
              subtasksByTask={subtasksByTask}
              isToday={b === today}
              collapsed={collapsed.has(b)}
              onToggleCollapse={toggleCollapse}
              onToggleTask={handleToggle}
              onDeleteTask={setPendingDelete}
              onEditTask={setEditing}
              onAdd={setAddingTo}
              onAddSubtask={setAddingSubtaskTo}
              onEditSubtask={setEditingSubtask}
              onToggleSubtask={handleToggleSubtask}
              onDeleteSubtask={setPendingDeleteSubtask}
              nestingId={nestingId}
            />
          ))}
        </div>
        <DragOverlay>
          {activeTask ? (
            <TaskCard
              task={activeTask}
              shade={openShade(activeTask.bucket, 0, 1)}
              subtasks={[]}
              onToggle={() => {}}
              onDelete={() => {}}
              onEdit={() => {}}
              onAddSubtask={() => {}}
              onEditSubtask={() => {}}
              onToggleSubtask={() => {}}
              onDeleteSubtask={() => {}}
            />
          ) : activeSubtask ? (
            <div className="subtask subtask-drag">
              <span className="subtask-title">{activeSubtask.title}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {addingTo && (
        <TaskSheet
          bucket={addingTo}
          onSubmit={(draft) => handleAdd(addingTo, draft)}
          onCancel={() => setAddingTo(null)}
        />
      )}

      {editing && (
        <TaskSheet
          bucket={editing.bucket}
          initialTitle={editing.title}
          initialDuration={editing.duration_min}
          initialStart={editing.start_time ? formatTime(editing.start_time) : null}
          onSubmit={(draft) => handleEdit(editing, draft)}
          onCancel={() => setEditing(null)}
        />
      )}

      {addingSubtaskTo && (
        <TaskSheet
          kind="subtask"
          bucket={addingSubtaskTo.bucket}
          onSubmit={(draft) => handleAddSubtask(addingSubtaskTo, draft)}
          onCancel={() => setAddingSubtaskTo(null)}
        />
      )}

      {editingSubtask && (
        <TaskSheet
          kind="subtask"
          bucket={subtaskParentBucket(editingSubtask)}
          initialTitle={editingSubtask.title}
          initialDuration={editingSubtask.duration_min}
          initialStart={
            editingSubtask.start_time ? formatTime(editingSubtask.start_time) : null
          }
          onSubmit={(draft) => handleEditSubtask(editingSubtask, draft)}
          onCancel={() => setEditingSubtask(null)}
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

      {pendingDeleteSubtask && (
        <ConfirmDialog
          title="Delete this subtask?"
          body={`“${pendingDeleteSubtask.title}” will be removed permanently. This can’t be undone.`}
          confirmLabel="Delete"
          onConfirm={() => handleDeleteSubtask(pendingDeleteSubtask)}
          onCancel={() => setPendingDeleteSubtask(null)}
        />
      )}
    </div>
  )
}
