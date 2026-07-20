import { BUCKET_HUE, BUCKET_CHROMA_SCALE } from './buckets'
import type { Bucket } from './types'

// The colour system (design-system.md §2). One formula parameterised by hue.
// Nothing here is stored — it is recomputed from position on every render.

export const DEFAULT_CHROMA = 0.13
const BACKLOG_CHROMA = 0.006

// Ramp constants. Verified against WCAG AA across all eight hues; the worst
// text/background pair on the whole ramp is 5.30:1. Change these and re-run the
// contrast check before shipping — the margins are not large.
const L_TOP = 0.66 // darkest card (rank 0 — the most important task)
const L_BOTTOM = 0.94 // palest card
const CHROMA_TAPER = 0.55 // chroma retained at the pale end: 1 - 0.55 = 45%
const INK_L = 0.25
const INK_CHROMA_SCALE = 0.5

export interface Shade {
  background: string
  foreground: string
  /** Kept for callers that tint overlays (duration chip). Always true now: the
   *  ramp is light throughout, so ink is always dark. */
  light: boolean
}

// --- Gamut clamp -----------------------------------------------------------
// The sRGB chroma ceiling collapses as lightness rises — hue 22 holds 0.244 at
// L 0.60 but only ~0.033 at L 0.94. Asking for more than that does not fail
// loudly; the browser clips per channel, which flattens the ramp AND drags the
// rendered hue off the one we asked for. Since `chroma` is a user-facing
// setting, no fixed taper is safe at every value, so we clamp against the
// actual gamut instead of guessing.

function oklchToLinearSrgb(L: number, C: number, hDeg: number) {
  const h = (hDeg * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

function inGamut(L: number, C: number, hue: number): boolean {
  return oklchToLinearSrgb(L, C, hue).every((v) => v >= -0.0005 && v <= 1.0005)
}

/** Largest chroma at (L, hue) that still renders inside sRGB. */
function maxChroma(L: number, hue: number): number {
  let lo = 0
  let hi = 0.4
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (inGamut(L, mid, hue)) lo = mid
    else hi = mid
  }
  return lo
}

/** Requested chroma, reduced only as far as the gamut actually requires. */
export function clampChroma(L: number, C: number, hue: number): number {
  if (inGamut(L, C, hue)) return C
  return maxChroma(L, hue) * 0.98
}

function chromaFor(bucket: Bucket): number {
  return bucket === 'backlog'
    ? BACKLOG_CHROMA
    : DEFAULT_CHROMA * BUCKET_CHROMA_SCALE[bucket]
}

/**
 * Shade for an OPEN task, given its 0-based rank `r` among the open tasks in
 * its bucket and the open-task count `n`. Deepest and most saturated at the
 * top, fading to near-white at the bottom.
 *
 * Chroma tapers with lightness rather than staying constant. A constant chroma
 * cannot survive a rising lightness ramp — the sRGB gamut ceiling collapses as
 * L climbs, so the pale end of every warm day used to clip and drift off-hue.
 * Tapering also just looks right: a tint that light *should* be less saturated.
 */
export function openShade(
  bucket: Bucket,
  r: number,
  n: number,
  chroma = chromaFor(bucket),
): Shade {
  const hue = BUCKET_HUE[bucket]
  const t = n > 1 ? r / (n - 1) : 0
  const L = L_TOP + t * (L_BOTTOM - L_TOP)
  const C = clampChroma(L, chroma * (1 - CHROMA_TAPER * t), hue)
  const inkC = clampChroma(INK_L, C * INK_CHROMA_SCALE, hue)
  return {
    background: `oklch(${L.toFixed(4)} ${C.toFixed(4)} ${hue})`,
    foreground: `oklch(${INK_L} ${inkC.toFixed(4)} ${hue})`,
    light: true,
  }
}

/** Shade for a completed task — off the scale, muted, faintly tinted. */
export function doneShade(bucket: Bucket, chroma = chromaFor(bucket)): Shade {
  const hue = BUCKET_HUE[bucket]
  const neutral = bucket === 'backlog'
  const bgC = neutral ? 0.004 : clampChroma(0.955, chroma * 0.16, hue)
  const fgC = neutral ? 0.006 : clampChroma(0.63, chroma * 0.24, hue)
  return {
    background: `oklch(0.955 ${bgC} ${hue})`,
    foreground: `oklch(0.63 ${fgC} ${hue})`,
    light: true,
  }
}

/**
 * Colour identity for the section itself, so a day reads as its own colour even
 * when it holds no tasks at all.
 */
export interface SectionShade {
  /** Pale wash behind the whole section. */
  background: string
  /** The day's colour at full strength — pill, rail, today ring. */
  accent: string
  /** Deep hue ink for the section label. */
  label: string
}

export function sectionShade(
  bucket: Bucket,
  chroma = chromaFor(bucket),
): SectionShade {
  const hue = BUCKET_HUE[bucket]
  return {
    background: `oklch(0.975 ${clampChroma(0.975, chroma * 0.16, hue).toFixed(4)} ${hue})`,
    accent: `oklch(0.62 ${clampChroma(0.62, chroma * 0.95, hue).toFixed(4)} ${hue})`,
    label: `oklch(0.38 ${clampChroma(0.38, chroma * 0.55, hue).toFixed(4)} ${hue})`,
  }
}
