import { useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Subtask, Task } from '../lib/types'
import { DAY_BUCKETS, BUCKET_LABEL, weekDates } from '../lib/buckets'
import { sectionShade } from '../lib/shading'
import { tallyUnits, groupSubtasks, weekReview, type DayUnits } from '../lib/completion'
import {
  fetchTasks,
  fetchSubtasks,
  fetchPlanOverrides,
  setPlanOverride,
  clearPlanOverride,
} from '../data/tasks'
import { AppHeader } from './AppHeader'
import { type Page } from './Tabs'

// The donut track radius; circumference drives the progress dasharray.
const RING_R = 62
const RING_C = 2 * Math.PI * RING_R

/**
 * The weekly review: a completion ring, the done / planned / backlog headline
 * figures, and a per-day breakdown.
 *
 * Days are counted by `planned_date`, not by the bucket a task now sits in, so
 * a day keeps its denominator after the nightly cascade moves its leftovers on
 * (decisions.md D13). The planned total of any day can be corrected by hand via
 * the pencil; the done count cannot, because it is evidence.
 */
export function Stats({
  user,
  page,
  onChange,
  onOpenProfile,
}: {
  user: User
  page: Page
  onChange: (p: Page) => void
  onOpenProfile: () => void
}) {
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [overrides, setOverrides] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)

  const dates = useMemo(() => {
    const week = weekDates()
    return DAY_BUCKETS.map((b) => week[b] as string)
  }, [])

  useEffect(() => {
    // Overrides degrade to an empty map: a day's figure is then the derived one,
    // which is right, only uncorrected. Losing the whole review over it would not
    // be — see Board's copy of this and migration 0009.
    Promise.all([
      fetchTasks(),
      fetchSubtasks(),
      fetchPlanOverrides().catch(() => ({})),
    ])
      .then(([t, s, o]) => {
        setTasks(t)
        setSubtasks(s)
        setOverrides(o)
      })
      .catch(() => setTasks([]))
  }, [])

  const stats = useMemo(() => {
    const rows = tasks ?? []
    const subsByTask = groupSubtasks(subtasks)
    const week = weekReview(rows, subsByTask, dates, overrides)
    const backlog = tallyUnits(
      rows.filter((t) => t.bucket === 'backlog'),
      subsByTask,
    ).total
    return { ...week, backlog }
  }, [tasks, subtasks, overrides, dates])

  // Write the correction through, then reflect it locally. An empty or unparsable
  // value clears the override and the day falls back to its derived total.
  async function commitOverride(date: string, raw: string) {
    const trimmed = raw.trim()
    const parsed = trimmed === '' ? null : Number.parseInt(trimmed, 10)
    const next =
      parsed === null || Number.isNaN(parsed) || parsed < 0 ? null : parsed
    try {
      if (next === null) {
        await clearPlanOverride(date)
        setOverrides((prev) => {
          const { [date]: _dropped, ...rest } = prev
          return rest
        })
      } else {
        await setPlanOverride(user.id, date, next)
        setOverrides((prev) => ({ ...prev, [date]: next }))
      }
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const loading = tasks === null

  return (
    <div className="board">
      <AppHeader
        user={user}
        weekPct={stats.pct}
        page={page}
        onChange={onChange}
        onOpenProfile={onOpenProfile}
      />

      {loading ? (
        <p className="status">Loading…</p>
      ) : (
        <div className="review">
          {error && <p className="board-error">{error}</p>}

          <section className="review-card">
            <div className="ring">
              <svg
                className="ring-svg"
                width="150"
                height="150"
                viewBox="0 0 150 150"
              >
                <circle
                  cx="75"
                  cy="75"
                  r={RING_R}
                  fill="none"
                  stroke="oklch(0.9 0.005 95)"
                  strokeWidth="14"
                />
                <circle
                  cx="75"
                  cy="75"
                  r={RING_R}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={`${(RING_C * stats.pct) / 100} ${RING_C}`}
                />
              </svg>
              <div className="ring-center">
                <span className="ring-pct">{stats.pct}%</span>
                <span className="ring-label">completed</span>
              </div>
            </div>

            <div className="review-figures">
              <Figure value={stats.done} label="done" />
              <Figure value={stats.total} label="planned" />
              <Figure value={stats.backlog} label="backlog" tone="backlog" />
            </div>
          </section>

          <h2 className="review-section-label">By day</h2>
          <div className="by-day">
            {stats.days.map((d, i) => (
              <DayRow
                key={d.date}
                day={d}
                label={BUCKET_LABEL[DAY_BUCKETS[i]].slice(0, 3)}
                accent={sectionShade(DAY_BUCKETS[i]).accent}
                onCommit={(raw) => commitOverride(d.date, raw)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * One day's bar. The count doubles as the edit affordance: tapping the pencil
 * swaps the planned total for a number field. Blur or Enter commits, Escape
 * abandons, and an empty field restores the derived figure.
 */
function DayRow({
  day,
  label,
  accent,
  onCommit,
}: {
  day: DayUnits
  label: string
  accent: string
  onCommit: (raw: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const input = useRef<HTMLInputElement>(null)
  // Escape must not commit, but it blurs the field — so the blur handler needs
  // to know the edit was already abandoned.
  const abandoned = useRef(false)

  useEffect(() => {
    if (editing) input.current?.focus()
  }, [editing])

  function open() {
    abandoned.current = false
    setDraft(String(day.total))
    setEditing(true)
  }

  function commit() {
    if (abandoned.current) return
    setEditing(false)
    if (draft.trim() !== String(day.total)) onCommit(draft)
  }

  return (
    <div className="by-day-row">
      <span className="by-day-dot" style={{ background: accent }} />
      <span className="by-day-name">{label}</span>
      <div className="by-day-track">
        <div
          className="by-day-fill"
          style={{ width: `${day.pct}%`, background: accent }}
        />
      </div>

      {editing ? (
        <span className="by-day-count by-day-count-editing">
          {day.done}/
          <input
            ref={input}
            className="by-day-input"
            type="number"
            inputMode="numeric"
            min={0}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') {
                abandoned.current = true
                setEditing(false)
              }
            }}
          />
        </span>
      ) : (
        <>
          <span
            className={`by-day-count${day.overridden ? ' by-day-count-edited' : ''}`}
          >
            {day.done}/{day.total}
          </span>
          <button
            type="button"
            className="by-day-edit"
            aria-label={`Edit ${label} planned total`}
            onClick={open}
          >
            {/* pencil */}
            <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </>
      )}
    </div>
  )
}

function Figure({
  value,
  label,
  tone,
}: {
  value: number
  label: string
  tone?: 'backlog'
}) {
  return (
    <div className="figure">
      <div className={`figure-value${tone ? ` figure-value-${tone}` : ''}`}>
        {value}
      </div>
      <div className="figure-label">{label}</div>
    </div>
  )
}
