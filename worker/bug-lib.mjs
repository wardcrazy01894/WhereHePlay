/**
 * Pure helpers for the /bug route: turn a player's report into a GitHub
 * issue safely. The issue is PUBLIC and the text is attacker-controlled, so
 * everything that goes into it passes through defang().
 */

export const MAX_BUG_BODY_BYTES = 20_000
export const MAX_MESSAGE = 2_000
export const MAX_LOGS = 6_000
export const MAX_URL = 500
export const MAX_CONTEXT = 120

/**
 * Neutralise report text so it can't ping users, break out of its block, or
 * inject a DISGUISED link/image: @mentions, code fences and Markdown
 * link/image syntax are broken with a zero-width space; raw HTML is
 * entity-escaped; issue cross-references (#123 / GH-123) are broken so a
 * report can't spray backlinks. A bare https://… URL stays readable.
 */
export function defang(s) {
  return (
    String(s)
      .replace(/```/g, '`​`​`')
      .replace(/@/g, '@​')
      .replace(/!\[/g, '!​[')
      .replace(/\]\(/g, ']​(')
      .replace(/\]\[/g, ']​[')
      // `]:` anywhere, not only at line start: a reference definition is also
      // valid at the start of a list item or block quote ("- [a]: http://…").
      .replace(/\]:/g, ']\u200B:')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/#(\d)/g, '#​$1')
      .replace(/\bGH-(\d)/gi, 'GH-\u200B$1')
      .replace(/\r/g, '')
  )
}

/** True if `url` parses and its origin is EXACTLY one of `origins`. */
export function urlFromAllowedOrigin(url, origins) {
  try {
    return origins.includes(new URL(url).origin)
  } catch {
    return false
  }
}

/**
 * What a report is. `bug` is the free-text form; `player` is the one-click
 * "please add this player" request from the player search.
 */
export const KINDS = {
  bug: { prefix: '[bug] ', labels: ['bug', 'from-app'] },
  player: {
    prefix: '[player request] ',
    labels: ['player-request', 'from-app'],
  },
}

/** The kind's prefix + the first line, ≤ 80 chars: backticks, at-signs,
 *  brackets, angle brackets and newlines flattened, issue references broken. */
export function issueTitle(message, kind = 'bug') {
  return (
    KINDS[kind].prefix +
    (String(message).split('\n')[0] || '')
      .replace(/[`@\r\n<>[\]]/g, ' ')
      // Titles autolink #123, owner/repo#123 and GH-123 too — each would drop
      // a backlink on some other issue.
      .replace(/#(\d)/g, '#\u200B$1')
      .replace(/\bGH-(\d)/gi, 'GH-\u200B$1')
      .slice(0, 80)
      .trim()
  )
}

/**
 * Validate a report and build the issue. Returns `{ ok, value: {title, body} }`
 * or `{ ok: false, status, error }`. `origins` is the worker's allowlist: the
 * reported page URL is kept only if it is from our own site.
 */
export function buildIssue(input, origins) {
  const kind = input?.kind === 'player' ? 'player' : 'bug'
  const message = String(input?.message ?? '')
    .slice(0, MAX_MESSAGE)
    .trim()
  if (!message) return { ok: false, status: 400, error: 'empty message' }
  const ctx =
    input?.context && typeof input.context === 'object' ? input.context : {}
  const short = (v) => defang(String(v ?? '?').slice(0, MAX_CONTEXT))
  const url = String(ctx.url ?? '').slice(0, MAX_URL)
  const safeUrl = origins.includes('*')
    ? defang(url)
    : urlFromAllowedOrigin(url, origins)
      ? defang(new URL(url).href)
      : '(omitted)'
  const logs = String(input?.logs ?? '').slice(0, MAX_LOGS)
  const body = [
    defang(message),
    '',
    '---',
    `Screen: ${short(ctx.screen)}`,
    `Puzzle day: ${short(ctx.date)}`,
    `Build: ${short(ctx.build)}`,
    `URL: ${safeUrl}`,
    `Browser: ${defang(String(ctx.userAgent ?? '').slice(0, 300))}`,
    '',
    '<details><summary>session logs</summary>',
    '',
    '```',
    defang(logs) || '(none)',
    '```',
    '</details>',
  ].join('\n')
  return {
    ok: true,
    value: {
      title: issueTitle(message, kind),
      body,
      labels: KINDS[kind].labels,
    },
  }
}

/** Most reports accepted per UTC day, across everyone. */
export const MAX_REPORTS_PER_DAY = 100

/**
 * Global daily cap, counted in D1 (`meta` key `bugs:<date>`): the per-IP
 * limiter alone would let one address file ~7,000 public issues a day, and a
 * botnet far more. Returns true if this report may be filed. Atomic.
 */
export async function takeDailySlot(db, now, max = MAX_REPORTS_PER_DAY) {
  const key = `bugs:${now.toISOString().slice(0, 10)}`
  const row = await db
    .prepare(
      `INSERT INTO meta (key, value, updated_at) VALUES (?1, '1', ?2)
       ON CONFLICT(key) DO UPDATE SET
         value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = excluded.updated_at
       RETURNING value`,
    )
    .bind(key, now.getTime())
    .first()
  return Number(row?.value) <= max
}

/**
 * File the issue. Resolves `{ ok: true, url }` or `{ ok: false, status }`;
 * never throws and never logs the token.
 */
export async function createIssue(env, issue, fetchImpl = fetch) {
  let res
  try {
    res = await fetchImpl(
      `https://api.github.com/repos/${env.GH_REPO}/issues`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.GH_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'WhereHePlay-bug-bot',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: issue.title,
          body: issue.body,
          labels: issue.labels ?? KINDS.bug.labels,
        }),
      },
    )
  } catch (e) {
    console.error('bug: github request threw', { error: String(e) })
    return { ok: false, status: 502 }
  }
  if (!res.ok) {
    // Status + GitHub's reason (expired token, archived repo, rate limit).
    const detail = await res.text().catch(() => '')
    console.error('bug: github issue create failed', {
      status: res.status,
      body: detail.slice(0, 300),
    })
    return { ok: false, status: 502 }
  }
  const created = await res.json().catch(() => ({}))
  return {
    ok: true,
    url: typeof created.html_url === 'string' ? created.html_url : '',
  }
}
