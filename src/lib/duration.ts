// "Duration" and "when" are optional task metadata (docs/decisions.md D6, D10).
// Duration is stored as minutes (tasks.duration_min); start time as HH:MM[:SS]
// (tasks.start_time). These helpers cover the entry presets and the card chips.

// Preset chips offered in the add/edit sheet, in minutes. A custom field beside
// them keeps the long tail reachable — see D6's input-UX amendment.
export const DURATION_PRESETS = [15, 30, 60, 120] as const

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
