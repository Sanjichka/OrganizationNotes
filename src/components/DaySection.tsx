import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Bucket, Task } from '../lib/types'
import { BUCKET_LABEL } from '../lib/buckets'
import { openShade, doneShade, sectionShade } from '../lib/shading'
import { TaskCard } from './TaskCard'

interface Props {
  bucket: Bucket
  tasks: Task[] // already canonically sorted
  isToday: boolean
  collapsed: boolean
  onToggleCollapse: (bucket: Bucket) => void
  onToggleTask: (task: Task) => void
  onDeleteTask: (task: Task) => void
  onAdd: (bucket: Bucket) => void
}

export function DaySection({
  bucket,
  tasks,
  isToday,
  collapsed,
  onToggleCollapse,
  onToggleTask,
  onDeleteTask,
  onAdd,
}: Props) {
  const { setNodeRef } = useDroppable({ id: `bucket:${bucket}` })
  const open = tasks.filter((t) => !t.done)
  const done = tasks.filter((t) => t.done)
  const n = open.length
  const sec = sectionShade(bucket)

  return (
    <section
      className="section"
      style={{
        background: sec.background,
        ...(isToday ? { boxShadow: `0 0 0 2px ${sec.accent}` } : null),
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
                onToggle={onToggleTask}
                onDelete={onDeleteTask}
              />
            ))}
          </SortableContext>
          {done.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              shade={doneShade(bucket)}
              onToggle={onToggleTask}
              onDelete={onDeleteTask}
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
