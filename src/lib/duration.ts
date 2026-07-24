// "Duration" and "when" are optional task metadata (docs/decisions.md D6, D10).
// Duration is stored as minutes (tasks.duration_min); start time as HH:MM[:SS]
// (tasks.start_time). These helpers cover the entry presets and the card chips.

// Preset chips offered in the add/edit sheet, in minutes. An hours+minutes
// picker beside them keeps the long tail reachable — see D6's input-UX
// amendment.
export const DURATION_PRESETS = [15, 30, 60, 120] as const

// Choices in the custom picker. Hours run to 12 — past that a "task" is a day,
// not a task. Minutes step by 5: fine enough to plan with, short enough to spin
// through on a wheel.
export const CUSTOM_HOURS = Array.from({ length: 13 }, (_, i) => i)
export const CUSTOM_MINUTES = Array.from({ length: 12 }, (_, i) => i * 5)

// Minutes → {h, m} for the custom picker.
export function splitDuration(min: number | null): { h: number; m: number } {
  if (min == null || min <= 0) return { h: 0, m: 0 }
  return { h: Math.floor(min / 60), m: min % 60 }
}

// Minutes → compact chip label: 45 → "45m", 60 → "1h", 90 → "1h30".
export function formatDuration(min: number): string {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}h` : `${h}h${m}`
}

// Postgres `time` comes back as "HH:MM:SS"; an <input type="time"> gives "HH:MM".
// The chip and the edit field both want "HH:MM", so trim to the first five chars.
export function formatTime(t: string): string {
  return t.slice(0, 5)
}
