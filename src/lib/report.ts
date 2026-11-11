/**
 * Bug reports. Two paths, chosen automatically:
 *  1. The API worker's /bug route files a GitHub issue with a token kept
 *     server-side — the player types and hits send; no GitHub account needed.
 *  2. If that is unavailable (API unset, token not configured, rate limited,
 *     offline) the player gets a PREFILLED GitHub "new issue" link instead.
 */
import { API_BASE, apiEnabled } from './api'
import { dumpLogs } from './log'

export const REPO_URL = 'https://github.com/wardcrazy01894/WhereHePlay'
export const MAX_REPORT_CHARS = 2000

export interface ReportContext {
  /** What was on screen, e.g. "daily nfl". */
  screen: string
  /** Puzzle day. */
  date: string
}

const env = () => ({
  build: import.meta.env.VITE_BUILD_HASH ?? 'dev',
  url: typeof location !== 'undefined' ? location.href : '',
  userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
})

/** The JSON body POSTed to /bug. Pure given the environment. */
export function buildReportPayload(
  message: string,
  ctx: ReportContext,
  includeLogs: boolean,
) {
  return {
    message: message.trim().slice(0, MAX_REPORT_CHARS),
    context: { ...ctx, ...env() },
    logs: includeLogs ? dumpLogs().slice(-4000) : '',
  }
}

/** Prefilled GitHub new-issue URL (the fallback path). */
export function bugReportUrl(message: string, ctx: ReportContext): string {
  const e = env()
  const title = '[bug] ' + (message.trim().split('\n')[0] || '').slice(0, 80)
  const body = [
    '**What happened?**',
    '',
    message.trim(),
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

export type SubmitResult =
  | { ok: true; /** The created issue. */ url: string }
  | {
      ok: false
      /** Prefilled issue page to open instead. */ fallbackUrl: string
    }

/** Send a report. Never throws: any failure resolves to the fallback link. */
export async function submitBugReport(
  message: string,
  ctx: ReportContext,
  includeLogs: boolean,
  fetchImpl: typeof fetch = fetch,
): Promise<SubmitResult> {
  const fallback: SubmitResult = {
    ok: false,
    fallbackUrl: bugReportUrl(message, ctx),
  }
  if (!apiEnabled) return fallback
  try {
    const res = await fetchImpl(API_BASE + '/bug', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildReportPayload(message, ctx, includeLogs)),
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
