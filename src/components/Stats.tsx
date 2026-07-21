import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Bucket, Task } from '../lib/types'
import { DAY_BUCKETS, BUCKET_LABEL } from '../lib/buckets'
import { sectionShade } from '../lib/shading'
import { fetchTasks } from '../data/tasks'
import { AppHeader } from './AppHeader'
import { type Page } from './Tabs'

// The donut track radius; circumference drives the progress dasharray.
const RING_R = 62
const RING_C = 2 * Math.PI * RING_R

interface DayStat {
  bucket: Bucket
  done: number
  total: number
}

/**
 * The weekly review: a completion ring, the done / planned / backlog headline
 * figures, and a per-day breakdown. All of it is derived from the same task
 * rows the board reads — nothing here is stored. This is the scaffold from the
 * mockup, ready to grow (carried-over / dropped metrics, historical weeks).
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

  useEffect(() => {
    fetchTasks()
      .then(setTasks)
      .catch(() => setTasks([]))
  }, [])

  const stats = useMemo(() => {
    const rows = tasks ?? []
    const days: DayStat[] = DAY_BUCKETS.map((bucket) => {
      const inBucket = rows.filter((t) => t.bucket === bucket)
      return {
        bucket,
        done: inBucket.filter((t) => t.done).length,
        total: inBucket.length,
      }
    })
    const planned = days.reduce((n, d) => n + d.total, 0)
    const doneTotal = days.reduce((n, d) => n + d.done, 0)
    const backlog = rows.filter((t) => t.bucket === 'backlog').length
    const weekPct = planned ? Math.round((doneTotal / planned) * 100) : 0
    return { days, planned, doneTotal, backlog, weekPct }
  }, [tasks])

  const loading = tasks === null

  return (
    <div className="board">
      <AppHeader
        user={user}
        weekPct={stats.weekPct}
        page={page}
        onChange={onChange}
        onOpenProfile={onOpenProfile}
      />

      {loading ? (
        <p className="status">Loading…</p>
      ) : (
        <div className="review">
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
                  strokeDasharray={`${(RING_C * stats.weekPct) / 100} ${RING_C}`}
                />
              </svg>
              <div className="ring-center">
                <span className="ring-pct">{stats.weekPct}%</span>
                <span className="ring-label">completed</span>
              </div>
            </div>

            <div className="review-figures">
              <Figure value={stats.doneTotal} label="done" />
              <Figure value={stats.planned} label="planned" />
              <Figure value={stats.backlog} label="backlog" tone="backlog" />
            </div>
          </section>

          <h2 className="review-section-label">By day</h2>
          <div className="by-day">
            {stats.days.map((d) => {
              const accent = sectionShade(d.bucket).accent
              const pct = d.total ? Math.round((d.done / d.total) * 100) : 0
              return (
                <div key={d.bucket} className="by-day-row">
                  <span
                    className="by-day-dot"
                    style={{ background: accent }}
                  />
                  <span className="by-day-name">
                    {BUCKET_LABEL[d.bucket].slice(0, 3)}
                  </span>
                  <div className="by-day-track">
                    <div
                      className="by-day-fill"
                      style={{ width: `${pct}%`, background: accent }}
                    />
                  </div>
                  <span className="by-day-count">
                    {d.done}/{d.total}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
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
