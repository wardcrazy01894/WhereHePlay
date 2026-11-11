/**
 * Reports to the maintainer: bug reports and "please add this player"
 * requests. Two paths, chosen automatically:
 *  1. The API worker's /bug route files a GitHub issue with a token kept
 *     server-side — the player types and hits send; no GitHub account needed.
 *  2. If that is unavailable (API unset, token not configured, rate limited,
 *     offline) the player gets a PREFILLED GitHub "new issue" link instead.
 */
import { API_BASE, apiEnabled } from './api'
import { dumpLogs } from './log'

export const REPO_URL = 'https://github.com/wardcrazy01894/WhereHePlay'
export const MAX_REPORT_CHARS = 2000
/** Longest prefilled-issue URL we will build (GitHub rejects very long ones). */
export const MAX_ISSUE_URL = 6000

/** A free-text bug report, or a one-click "please add this player" request. */
export type ReportKind = 'bug' | 'player'
const TITLE_PREFIX: Record<ReportKind, string> = {
  bug: '[bug] ',
  player: '[player request] ',
}

export interface ReportContext {
  /** What was on screen, e.g. "daily nfl". */
  screen: string
  /** Puzzle day. */
  date: string
}

/** The message a player request is filed with. Quotes are stripped so the
 *  name can't nest inside the wrapping quotes. */
export function playerRequestMessage(name: string): string {
  const clean = name.replace(/"/g, '').replace(/\s+/g, ' ').trim()
  return `Please add "${clean}" to the game.`
}

/** First `n` characters by code point — a plain slice can cut an emoji in
 *  half, and encodeURIComponent throws on the stray half. */
export function clip(s: string, n: number): string {
  return Array.from(wellFormed(s)).slice(0, n).join('')
}

/** Replace lone surrogates (pasted junk) with U+FFFD: encodeURIComponent
 *  throws on them, and the fallback link must never throw. */
export function wellFormed(s: string): string {
  // Match a valid pair first and keep it; any other surrogate is alone.
  // (No lookbehind: Safari before 16.4 cannot even parse one, and a regex
  // literal it cannot parse stops the whole bundle from loading.)
  return s.replace(
    /([\uD800-\uDBFF][\uDC00-\uDFFF])|[\uD800-\uDFFF]/g,
    (m, pair) => (pair ? m : '\uFFFD'),
  )
}

const env = () => ({
  build: import.meta.env.VITE_BUILD_HASH ?? 'dev',
  url: typeof location !== 'undefined' ? location.href.slice(0, 300) : '',
  userAgent:
    typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : '',
})

/** The JSON body POSTed to /bug. Pure given the environment. */
export function buildReportPayload(
  message: string,
  ctx: ReportContext,
  includeLogs: boolean,
  kind: ReportKind = 'bug',
) {
  return {
    kind,
    message: clip(message.trim(), MAX_REPORT_CHARS),
    context: { ...ctx, ...env() },
    logs: includeLogs ? dumpLogs().slice(-4000) : '',
  }
}

function issueUrl(
  message: string,
  ctx: ReportContext,
  kind: ReportKind,
): string {
  const e = env()
  const title = TITLE_PREFIX[kind] + clip(message.split('\n')[0] || '', 80)
  const body = [
    '**What happened?**',
    '',
    message,
    '',
    '---',
    `Screen: ${ctx.screen}`,
    `Puzzle day: ${ctx.date}`,
    `Build: ${e.build}`,
    `URL: ${e.url}`,
    `Browser: ${e.userAgent}`,
  ].join('\n')
  return `${REPO_URL}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`
}

/**
 * Prefilled GitHub new-issue URL (the fallback path). A long or heavily
 * encoded message is shortened until the URL fits MAX_ISSUE_URL — this is the
 * path used when the worker is down, so it has to open.
 */
export function bugReportUrl(
  message: string,
  ctx: ReportContext,
  kind: ReportKind = 'bug',
): string {
  let text = wellFormed(message).trim()
  let url = issueUrl(text, ctx, kind)
  while (url.length > MAX_ISSUE_URL && text.length > 0) {
    text = clip(text, Math.floor(Array.from(text).length * 0.8))
    url = issueUrl(text + '…', ctx, kind)
  }
  return url
}

export type SubmitResult =
  | { ok: true; /** The created issue ('' if unknown). */ url: string }
  | {
      ok: false
      /** Prefilled issue page to open instead. */
      fallbackUrl: string
    }

/** Send a report. Never throws: any failure resolves to the fallback link. */
export async function submitBugReport(
  message: string,
  ctx: ReportContext,
  includeLogs: boolean,
  fetchImpl: typeof fetch = fetch,
  kind: ReportKind = 'bug',
): Promise<SubmitResult> {
  const fallback: SubmitResult = {
    ok: false,
    fallbackUrl: bugReportUrl(message, ctx, kind),
  }
  if (!apiEnabled) return fallback
  try {
    const res = await fetchImpl(API_BASE + '/bug', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildReportPayload(message, ctx, includeLogs, kind)),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      url?: unknown
    }
    if (!res.ok || data.ok !== true) return fallback
    // Only ever link to an issue in our own repo.
    const url =
      typeof data.url === 'string' && data.url.startsWith(REPO_URL + '/')
        ? data.url
        : ''
    return { ok: true, url }
  } catch {
    return fallback
  }
}
