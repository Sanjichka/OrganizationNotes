import type { User } from '@supabase/supabase-js'
import { weekRangeLabel } from '../lib/buckets'
import { avatarUrl, displayName, initials } from '../lib/profile'
import { Tabs, type Page } from './Tabs'

interface Props {
  user: User
  /** Share of this week's day-tasks that are done, 0–100. */
  weekPct: number
  page: Page
  onChange: (p: Page) => void
  onOpenProfile: () => void
}

/**
 * The persistent top of the app: the avatar (which opens the profile), the
 * user's name and the week's date range, this week's completion figure, and the
 * Week / Review switch. Shared by both views so the chrome never shifts as you
 * move between them.
 */
export function AppHeader({
  user,
  weekPct,
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
          <p className="week-range">{weekRangeLabel()}</p>
        </div>
        <div className="week-pct-wrap">
          <span className="week-pct">{weekPct}%</span>
          <span className="week-pct-label">This week</span>
        </div>
      </div>
      <Tabs page={page} onChange={onChange} />
    </header>
  )
}
