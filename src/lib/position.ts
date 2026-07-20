import type { Task } from './types'

// position is a fractional rank, not an index (data-model.md §3).
// Moving a task writes ONE row; never renumber a whole bucket on a reorder.

const MIN_GAP = 1e-6

/**
 * Position for dropping a task between `above` and `below` (either may be
 * undefined at the ends). Returns null if the midpoint gap has collapsed and
 * the bucket needs a rebalance first.
 */
export function between(
  above: number | undefined,
  below: number | undefined,
): number | null {
  if (above === undefined && below === undefined) return 0
  if (above === undefined) return (below as number) - 1
  if (below === undefined) return above + 1
  if (below - above < MIN_GAP) return null
  return (above + below) / 2
}

/** Append below the current maximum open position in a list. */
export function appendPosition(tasks: Task[]): number {
  const max = tasks.reduce((m, t) => Math.max(m, t.position), Number.NEGATIVE_INFINITY)
  return max === Number.NEGATIVE_INFINITY ? 0 : max + 1
}

/** Canonical sort: done asc, completed_at asc nulls first, position asc. */
export function canonicalSort(a: Task, b: Task): number {
  if (a.done !== b.done) return a.done ? 1 : -1
  const ca = a.completed_at
  const cb = b.completed_at
  if (ca !== cb) {
    if (ca === null) return -1
    if (cb === null) return 1
    return ca < cb ? -1 : 1
  }
  return a.position - b.position
}
