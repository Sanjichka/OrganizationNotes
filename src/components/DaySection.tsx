import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Bucket, Subtask, Task } from '../lib/types'
import { BUCKET_LABEL } from '../lib/buckets'
import { openShade, doneShade, sectionShade } from '../lib/shading'
import { TaskCard } from './TaskCard'

interface Props {
  bucket: Bucket
  tasks: Task[] // already canonically sorted
  subtasksByTask: Record<string, Subtask[]> // sorted by position
  isToday: boolean
  collapsed: boolean
  onToggleCollapse: (bucket: Bucket) => void
  onToggleTask: (task: Task) => void
  onDeleteTask: (task: Task) => void
  onEditTask: (task: Task) => void
  onAdd: (bucket: Bucket) => void
  onAddSubtask: (task: Task, title: string) => void
  onToggleSubtask: (subtask: Subtask) => void
  onRenameSubtask: (subtask: Subtask, title: string) => void
  onDeleteSubtask: (subtask: Subtask) => void
}

export function DaySection({
  bucket,
  tasks,
  subtasksByTask,
  isToday,
  collapsed,
  onToggleCollapse,
  onToggleTask,
  onDeleteTask,
  onEditTask,
  onAdd,
  onAddSubtask,
  onToggleSubtask,
  onRenameSubtask,
  onDeleteSubtask,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: `bucket:${bucket}` })
  const open = tasks.filter((t) => !t.done)
  const done = tasks.filter((t) => t.done)
  const n = open.length
  const sec = sectionShade(bucket)

  return (
    <section
      // A collapsed day has no section-body to catch a drop, so the whole
      // section becomes the drop target — otherwise you could never move a task
      // into a folded day (which is all of them but today, on load).
      ref={collapsed ? setNodeRef : undefined}
      className="section"
      style={{
        background: sec.background,
        ...(isToday ? { boxShadow: `0 0 0 2px ${sec.accent}` } : null),
        // Drop-target cue: a bolder accent ring while a task hovers the folded
        // day. No background tint — accent is an oklch() string, and the colour
        // system stays OKLCH end to end (see CLAUDE.md).
        ...(collapsed && isOver
          ? { boxShadow: `0 0 0 3px ${sec.accent}` }
          : null),
      }}
    >
      <header className="section-head" onClick={() => onToggleCollapse(bucket)}>
        <span className="day-rail" style={{ background: sec.accent }} />
        <span className="chevron" style={{ rotate: collapsed ? '0deg' : '90deg' }}>
          ›
        </span>
        <span className="section-label" style={{ color: sec.label }}>
          {BUCKET_LABEL[bucket]}
        </span>
        {isToday && (
          <span className="today-pill" style={{ background: sec.accent }}>
            Today
          </span>
        )}
        <span className="section-sub">
          {n === 0 && done.length === 0
            ? 'empty'
            : `${done.length}/${tasks.length} done`}
        </span>
        <button
          type="button"
          className="add-btn"
          style={{ background: sec.accent }}
          aria-label={`Add task to ${BUCKET_LABEL[bucket]}`}
          onClick={(e) => {
            e.stopPropagation()
            onAdd(bucket)
          }}
        >
          +
        </button>
      </header>

      {collapsed ? (
        <NextUp bucket={bucket} open={open} hasDone={done.length > 0} />
      ) : (
        <div ref={setNodeRef} className="section-body">
          <SortableContext
            items={open.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            {open.map((t, i) => (
              <TaskCard
                key={t.id}
                task={t}
                shade={openShade(bucket, i, n)}
                subtasks={subtasksByTask[t.id] ?? []}
                onToggle={onToggleTask}
                onDelete={onDeleteTask}
                onEdit={onEditTask}
                onAddSubtask={onAddSubtask}
                onToggleSubtask={onToggleSubtask}
                onRenameSubtask={onRenameSubtask}
                onDeleteSubtask={onDeleteSubtask}
              />
            ))}
          </SortableContext>
          {done.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              shade={doneShade(bucket)}
              subtasks={subtasksByTask[t.id] ?? []}
              onToggle={onToggleTask}
              onDelete={onDeleteTask}
              onEdit={onEditTask}
              onAddSubtask={onAddSubtask}
              onToggleSubtask={onToggleSubtask}
              onRenameSubtask={onRenameSubtask}
              onDeleteSubtask={onDeleteSubtask}
            />
          ))}
          {tasks.length === 0 && <p className="empty">Nothing here.</p>}
        </div>
      )}
    </section>
  )
}

/**
 * Collapsed-state preview. A day that is folded shut is being asked "what do I
 * owe here?", so it answers with the top open task's name rather than an
 * abstract quantity — the count already sits in the header.
 */
function NextUp({
  bucket,
  open,
  hasDone,
}: {
  bucket: Bucket
  open: Task[]
  hasDone: boolean
}) {
  if (open.length === 0) {
    if (!hasDone) return null // header already reads 'empty'
    return (
      <p className="next-up next-up-done" style={{ color: doneShade(bucket).foreground }}>
        All done
      </p>
    )
  }

  const top = openShade(bucket, 0, open.length)
  return (
    <p className="next-up">
      <span className="next-dot" style={{ background: top.background }} />
      <span className="next-title" style={{ color: sectionShade(bucket).label }}>
        {open[0].title}
      </span>
    </p>
  )
}
