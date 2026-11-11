import { describe, it, expect, vi } from 'vitest'

// The API must be "configured" for the send path; set before the module loads.
vi.stubEnv('VITE_API_ENDPOINT', 'https://api.test')
const { REPO_URL, bugReportUrl, buildReportPayload, submitBugReport } =
  await import('./report')

const ctx = { screen: 'daily nfl', date: '2026-11-11' }

describe('buildReportPayload', () => {
  it('trims the message, carries the context and optionally the logs', () => {
    const p = buildReportPayload('  broke  ', ctx, true)
    expect(p.message).toBe('broke')
    expect(p.context).toMatchObject({ screen: 'daily nfl', date: '2026-11-11' })
    expect(typeof p.context.build).toBe('string')
    expect(typeof p.logs).toBe('string')
    expect(buildReportPayload('x', ctx, false).logs).toBe('')
    expect(
      buildReportPayload('y'.repeat(5000), ctx, false).message,
    ).toHaveLength(2000)
  })
})

describe('bugReportUrl', () => {
  it('is a prefilled new-issue link in our repo', () => {
    const url = new URL(bugReportUrl('Wrong school for Romo\nmore', ctx))
    expect(url.origin + url.pathname).toBe(REPO_URL + '/issues/new')
    expect(url.searchParams.get('title')).toBe('[bug] Wrong school for Romo')
    expect(url.searchParams.get('body')).toContain('Screen: daily nfl')
    expect(url.searchParams.get('body')).toContain(
      'Wrong school for Romo\nmore',
    )
  })
})

describe('submitBugReport', () => {
  const ok = (body: unknown, status = 200) =>
    vi.fn(async () => ({
      ok: status < 400,
      status,
      json: async () => body,
    })) as never

  it('posts to /bug and returns the issue link', async () => {
    const f = ok({ ok: true, url: REPO_URL + '/issues/12' })
    expect(await submitBugReport('broke', ctx, true, f)).toEqual({
      ok: true,
      url: REPO_URL + '/issues/12',
    })
    const [url, init] = (
      f as unknown as { mock: { calls: [string, RequestInit][] } }
    ).mock.calls[0]
    expect(url).toBe('https://api.test/bug')
    expect(JSON.parse(String(init.body)).message).toBe('broke')
  })
  it('never links anywhere but our repo', async () => {
    const r = await submitBugReport(
      'x',
      ctx,
      false,
      ok({ ok: true, url: 'https://evil.example/' }),
    )
    expect(r).toEqual({ ok: true, url: '' })
  })
  it('falls back to the prefilled link on 503, 429, bad JSON or a network error', async () => {
    const cases = [
      ok({ error: 'reporting disabled' }, 503),
      ok({ error: 'too many' }, 429),
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('x')
        },
      })) as never,
      vi.fn(async () => {
        throw new Error('offline')
      }) as never,
    ]
    for (const f of cases) {
      const r = await submitBugReport('broke', ctx, false, f)
      expect(r.ok).toBe(false)
      if (!r.ok)
        expect(r.fallbackUrl).toContain(REPO_URL + '/issues/new?title=')
    }
  })
})
