import type { User } from '@supabase/supabase-js'
import { weekRangeLabel, weekRef } from '../lib/buckets'
import { avatarUrl, displayName, initials } from '../lib/profile'
import { Tabs, type Page } from './Tabs'

interface Props {
  user: User
  /**
   * Share of this week's day-tasks that are done, 0–100. Undefined on a screen
   * that has not loaded the tasks to compute it — the slot keeps its shape and
   * reads "—", because a placeholder 0% would be indistinguishable from a week
   * in which nothing got done.
   */
  weekPct?: number
  /**
   * Which week's date range to label, 0 = this week. Only the range follows the
   * page: the percentage is always *this* week's, so the same figure reads the
   * same on every tab (decisions.md D12).
   */
  weekOffset?: number
  page: Page
  onChange: (p: Page) => void
  onOpenProfile: () => void
}

/**
 * The persistent top of the app: the avatar (which opens the profile), the
 * user's name and the week's date range, this week's completion figure, and the
 * view switch. Shared by every view so the chrome never shifts as you move
 * between them.
 */
export function AppHeader({
  user,
  weekPct,
  weekOffset = 0,
  page,
  onChange,
  onOpenProfile,
}: Props) {
  const name = displayName(user)
  const img = avatarUrl(user)

  return (
    <header className="app-header">
      <div className="app-header-row">
        <button
          type="button"
          className="avatar-btn"
          onClick={onOpenProfile}
          aria-label="Open profile"
          style={img ? { backgroundImage: `url("${img}")` } : undefined}
        >
          {img ? '' : initials(name)}
        </button>
        <div className="app-header-id">
          <div className="app-header-name">{name}</div>
          <p className="week-range">{weekRangeLabel(weekRef(weekOffset))}</p>
        </div>
        <div className="week-pct-wrap">
          <span className="week-pct">
            {weekPct === undefined ? '—' : `${weekPct}%`}
          </span>
          <span className="week-pct-label">This week</span>
        </div>
      </div>
      <Tabs page={page} onChange={onChange} />
    </header>
  )
}
