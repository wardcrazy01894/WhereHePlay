import { EPOCH_DATE_KEY, addDays, getDateKey, isValidDateKey } from './daily'

/** How far ahead of today `?date=` may reach. */
const MAX_PRACTICE_DAYS_AHEAD = 7

/**
 * `?date=YYYY-MM-DD` plays another day as practice (nothing is recorded).
 * Only from puzzle #1 to a week ahead: the lineup for a day is computed by
 * walking forward from the epoch, so an arbitrary far-future date in a shared
 * link would freeze the tab.
 */
export function resolveDay(
  search: string,
  now: Date,
): { dateKey: string; official: boolean } {
  const today = getDateKey(now)
  const asked = new URLSearchParams(search).get('date')
  if (
    asked &&
    isValidDateKey(asked) &&
    asked !== today &&
    asked >= EPOCH_DATE_KEY &&
    asked <= addDays(today, MAX_PRACTICE_DAYS_AHEAD)
  )
    return { dateKey: asked, official: false }
  return { dateKey: today, official: true }
}
