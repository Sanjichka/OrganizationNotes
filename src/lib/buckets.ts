import type { Bucket } from './types'

export const DAY_BUCKETS: Bucket[] = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
]
export const ALL_BUCKETS: Bucket[] = [...DAY_BUCKETS, 'backlog']

export const BUCKET_LABEL: Record<Bucket, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
  backlog: 'Backlog',
}

// Each day owns one hue; backlog is rendered neutral (see design-system.md §1).
export const BUCKET_HUE: Record<Bucket, number> = {
  mon: 22, // clay red
  tue: 55, // ochre
  wed: 145, // sage
  thu: 195, // seafoam
  fri: 245, // dusty blue
  sat: 295, // muted violet
  sun: 345, // dusty rose
  backlog: 35,
}

// Per-hue chroma scale. OKLCH chroma is *not* perceptually equal across hues,
// and the sRGB gamut ceiling varies wildly with hue (yellow and teal run out of
// room long before violet does). A single global chroma therefore reads as
// uneven — some days shout, others go muddy — and clips outright at 165/225.
// These factors even out perceived intensity and keep every day in gamut.
export const BUCKET_CHROMA_SCALE: Record<Bucket, number> = {
  mon: 0.88,
  tue: 0.82,
  wed: 0.7,
  thu: 0.66,
  fri: 0.8,
  sat: 0.78,
  sun: 0.85,
  backlog: 1,
}

// Monday-based day index: Mon=0 … Sun=6.
function isoDay(d: Date): number {
  return (d.getDay() + 6) % 7
}

function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Today's local date as YYYY-MM-DD. */
export function todayISODate(ref = new Date()): string {
  return toISODate(ref)
}

/**
 * A date `offset` whole weeks from `ref` — 0 is this week, 1 is next week.
 *
 * This is the whole of the two-week model. A day-bucket task always carries a
 * real calendar date, so which week it belongs to is a question about its date,
 * not about extra state: Week and Next week are two filters over one table.
 * When the week turns, no row moves — next week's tasks simply start matching
 * the other filter. See docs/decisions.md D14.
 */
export function weekRef(offset: number, ref = new Date()): Date {
  const d = new Date(ref)
  d.setDate(ref.getDate() + offset * 7)
  return d
}

/** The date (YYYY-MM-DD) of each weekday in the week containing `ref`. */
export function weekDates(ref = new Date()): Record<Bucket, string | null> {
  const monday = new Date(ref)
  monday.setDate(ref.getDate() - isoDay(ref))
  const out = {} as Record<Bucket, string | null>
  DAY_BUCKETS.forEach((b, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    out[b] = toISODate(d)
  })
  out.backlog = null
  return out
}

/** The day bucket that is "today", or null if outside the current week view. */
export function todayBucket(ref = new Date()): Bucket {
  return DAY_BUCKETS[isoDay(ref)]
}

export function weekRangeLabel(ref = new Date()): string {
  const dates = weekDates(ref)
  const start = new Date(dates.mon as string)
  const end = new Date(dates.sun as string)
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}
