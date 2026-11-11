/**
 * Stale-tab protection: detect that a newer build has been deployed and
 * reload onto it, so nobody keeps playing an old cached copy.
 *
 * Every build bakes its git hash into the bundle (VITE_BUILD_HASH) and
 * publishes the same hash as version.json. The running app re-reads
 * version.json — bypassing every cache — on load, whenever the tab becomes
 * visible again, and every few minutes; a different hash means this tab is
 * stale. A reload revalidates index.html, which points at the new bundle.
 */

/** How often an open, visible tab re-checks. */
export const VERSION_CHECK_MS = 5 * 60_000

/** sessionStorage key: the deployed hash this tab last reloaded for. */
const ATTEMPT_KEY = 'whp:reloaded-for'

/**
 * The hash of the build that is live right now, or null if it can't be read.
 * Never throws: offline, a 404 in local dev and a half-finished deploy are
 * all "don't know", which means "do nothing".
 */
export async function fetchDeployedHash(
  base: string,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<string | null> {
  try {
    // The query string defeats the CDN cache; no-store defeats the browser's.
    const res = await fetchImpl(`${base}version.json?t=${now}`, {
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = (await res.json()) as { hash?: unknown }
    return typeof data.hash === 'string' && data.hash ? data.hash : null
  } catch {
    return null
  }
}

/**
 * Whether to reload now. Pure.
 *  - `safe`: nothing on screen would be lost or interrupted (the home
 *    screen). A game in progress is never yanked away; the reload waits.
 *  - `attempted`: the deployed hash this tab already reloaded for. One try
 *    per build, so a CDN edge still serving the old page can't cause a loop.
 */
export function shouldReload(a: {
  current: string
  deployed: string | null
  attempted: string | null
  safe: boolean
}): boolean {
  if (!a.current || a.current === 'dev') return false
  if (!a.deployed || a.deployed === a.current) return false
  if (a.attempted === a.deployed) return false
  return a.safe
}

export function readAttempt(): string | null {
  try {
    return sessionStorage.getItem(ATTEMPT_KEY)
  } catch {
    return null
  }
}
export function recordAttempt(hash: string): void {
  try {
    sessionStorage.setItem(ATTEMPT_KEY, hash)
  } catch {
    // Without sessionStorage there is no loop guard, so don't reload at all:
    // readAttempt() will keep returning null and the caller checks for that.
  }
}
