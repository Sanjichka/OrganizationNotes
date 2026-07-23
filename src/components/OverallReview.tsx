import type { User } from '@supabase/supabase-js'
import { AppHeader } from './AppHeader'
import { type Page } from './Tabs'

/**
 * The all-time review: performance across every week on record, not just the
 * current one.
 *
 * Deliberately blank for now. The weekly review answers "how did this week go?"
 * from `planned_date` and `completed_at`; the same two columns already hold the
 * whole history, so this screen needs no new data — only a decision about what
 * an all-time figure should actually say. Until that is settled, an empty page
 * is more honest than a number nobody has defined.
 */
export function OverallReview({
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
  return (
    <div className="board">
      <AppHeader
        user={user}
        page={page}
        onChange={onChange}
        onOpenProfile={onOpenProfile}
      />
      <div className="review">
        <p className="empty-page">Nothing here yet.</p>
      </div>
    </div>
  )
}
