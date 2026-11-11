import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import worker from './api.mjs'
import {
  buildIssue,
  createIssue,
  defang,
  issueTitle,
  urlFromAllowedOrigin,
  takeDailySlot,
} from './bug-lib.mjs'

/** D1-shaped adapter over node:sqlite with the real migrations (meta table). */
function freshDb() {
  const raw = new DatabaseSync(':memory:')
  const dir = new URL('./migrations/', import.meta.url)
  for (const f of readdirSync(dir).sort())
    raw.exec(readFileSync(new URL(f, dir), 'utf8'))
  const wrap = (sql, args) => ({
    first: () => raw.prepare(sql).all(...args)[0] ?? null,
  })
  return {
    prepare: (sql) => ({
      ...wrap(sql, []),
      bind: (...args) => wrap(sql, args),
    }),
  }
}

const ORIGINS = ['https://wardcrazy01894.github.io']

describe('defang', () => {
  it('breaks mentions, fences, links, images, HTML and issue references', () => {
    const out = defang(
      '@octocat ```x``` [a](http://evil) ![i](x) <img src=x> #12 GH-3 [r]: http://e',
    )
    expect(out).not.toContain('@octocat')
    expect(out).not.toContain('```')
    expect(out).not.toContain('](')
    expect(out).not.toContain('<img')
    expect(out).not.toContain('#12')
    expect(out).not.toContain('GH-3')
    expect(out).toContain('&lt;img')
  })
  it('breaks a reference definition wherever it sits (list item, quote)', () => {
    for (const p of [
      '- [a]: http://evil.com\n\nclick [a]',
      '1. [a]: http://evil',
      '> [a]: http://evil',
    ])
      expect(defang(p)).not.toContain(']:')
  })
  it('titles cannot cross-reference, mention or carry markup', () => {
    const t = issueTitle(
      'crash #1 org/repo#2 <b>x</b> GH-4 gh-5 [x](http://e) @bob `c`',
    )
    expect(t).not.toMatch(/#\d/)
    expect(t).not.toMatch(/GH-\d/i)
    // (after the fixed "[bug] " prefix)
    expect(t.slice(6)).not.toMatch(/[<>[\]@`]/)
    expect(t.startsWith('[bug] crash')).toBe(true)
  })
  it('leaves a bare URL readable', () => {
    expect(defang('see https://example.com/x')).toBe(
      'see https://example.com/x',
    )
  })
})

describe('buildIssue', () => {
  it('builds a defanged title and body with the context', () => {
    const r = buildIssue(
      {
        message: 'Tony Romo shows @everyone the wrong school\nsecond line',
        context: {
          screen: 'daily nfl',
          date: '2026-11-11',
          build: 'abc1234.5',
          url: 'https://wardcrazy01894.github.io/WhereHePlay/?x=1',
          userAgent: 'UA <b>',
        },
        logs: 'log line ``` break',
      },
      ORIGINS,
    )
    expect(r.ok).toBe(true)
    expect(r.value.title).toBe(
      '[bug] Tony Romo shows  everyone the wrong school',
    )
    expect(r.value.body).toContain('Screen: daily nfl')
    expect(r.value.body).toContain('Puzzle day: 2026-11-11')
    expect(r.value.body).toContain('Build: abc1234.5')
    expect(r.value.body).toContain(
      'URL: https://wardcrazy01894.github.io/WhereHePlay/?x=1',
    )
    expect(r.value.body).toContain('UA &lt;b&gt;')
    expect(r.value.body).not.toContain('@everyone')
    // The logs can't close their own code fence.
    expect(r.value.body.match(/```/g)).toHaveLength(2)
  })
  it('drops a URL that is not from our site (no phishing links in issues)', () => {
    const r = buildIssue(
      { message: 'x', context: { url: 'https://evil.example/login' } },
      ORIGINS,
    )
    expect(r.value.body).toContain('URL: (omitted)')
    expect(
      urlFromAllowedOrigin(
        'https://wardcrazy01894.github.io.evil.com/',
        ORIGINS,
      ),
    ).toBe(false)
  })
  it('rejects an empty message and caps a huge one', () => {
    expect(buildIssue({ message: '   ' }, ORIGINS)).toMatchObject({
      ok: false,
      status: 400,
    })
    expect(buildIssue({}, ORIGINS).ok).toBe(false)
    const big = buildIssue(
      { message: 'a'.repeat(50_000), logs: 'b'.repeat(50_000) },
      ORIGINS,
    )
    expect(big.value.body.length).toBeLessThan(9_000)
    expect(issueTitle('a'.repeat(500)).length).toBeLessThanOrEqual(86)
  })
  it('survives hostile context shapes', () => {
    expect(buildIssue({ message: 'x', context: 'nope' }, ORIGINS).ok).toBe(true)
    expect(
      buildIssue(
        { message: 'x', context: { screen: { a: 1 }, url: 5 } },
        ORIGINS,
      ).ok,
    ).toBe(true)
  })
})

describe('createIssue', () => {
  const env = { GH_REPO: 'o/r', GH_TOKEN: 'tok' }
  it('posts to the repo with the token and labels', async () => {
    const f = vi.fn(async () => ({
      ok: true,
      json: async () => ({ html_url: 'https://github.com/o/r/issues/7' }),
    }))
    expect(await createIssue(env, { title: 't', body: 'b' }, f)).toEqual({
      ok: true,
      url: 'https://github.com/o/r/issues/7',
    })
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://api.github.com/repos/o/r/issues')
    expect(init.headers.Authorization).toBe('Bearer tok')
    expect(JSON.parse(init.body)).toEqual({
      title: 't',
      body: 'b',
      labels: ['bug', 'from-app'],
    })
  })
  it('reports failure without throwing or logging the token', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const bad = vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => 'Bad credentials',
    }))
    expect(await createIssue(env, { title: 't', body: 'b' }, bad)).toEqual({
      ok: false,
      status: 502,
    })
    const boom = vi.fn(async () => {
      throw new Error('network')
    })
    expect(await createIssue(env, { title: 't', body: 'b' }, boom)).toEqual({
      ok: false,
      status: 502,
    })
    expect(JSON.stringify(err.mock.calls)).not.toContain('tok')
    err.mockRestore()
  })
})

describe('player requests', () => {
  it('get their own title prefix and label', () => {
    const r = buildIssue(
      { kind: 'player', message: 'Please add "Kurt Warner" to the game.' },
      ORIGINS,
    )
    expect(r.value.title).toBe(
      '[player request] Please add "Kurt Warner" to the game.',
    )
    expect(r.value.labels).toEqual(['player-request', 'from-app'])
    // Anything else is a plain bug report.
    expect(
      buildIssue({ kind: 'nonsense', message: 'x' }, ORIGINS).value.labels,
    ).toEqual(['bug', 'from-app'])
  })
})

describe('takeDailySlot', () => {
  it('allows `max` reports per UTC day, then refuses; a new day starts over', async () => {
    const db = freshDb()
    const day1 = new Date('2026-11-11T10:00:00Z')
    expect(await takeDailySlot(db, day1, 2)).toBe(true)
    expect(await takeDailySlot(db, day1, 2)).toBe(true)
    expect(await takeDailySlot(db, day1, 2)).toBe(false)
    expect(await takeDailySlot(db, new Date('2026-11-12T00:00:01Z'), 2)).toBe(
      true,
    )
  })
})

describe('/bug route', () => {
  afterEach(() => vi.unstubAllGlobals())
  const allow = { limit: async () => ({ success: true }) }
  const env = {
    DB: freshDb(),
    ALLOWED_ORIGIN: ORIGINS[0],
    RATE_LIMITER: allow,
    LOGIN_LIMITER: allow,
    BUG_LIMITER: allow,
    GH_REPO: 'o/r',
    GH_TOKEN: 'tok',
  }
  const post = async (body, e = env) => {
    const res = await worker.fetch(
      new Request('https://api.test/bug', {
        method: 'POST',
        headers: { Origin: ORIGINS[0], 'Content-Type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
      e,
      { waitUntil: () => {} },
    )
    return { status: res.status, body: await res.json() }
  }

  it('files an issue and returns its URL', async () => {
    const gh = vi.fn(async () => ({
      ok: true,
      json: async () => ({ html_url: 'https://github.com/o/r/issues/9' }),
    }))
    vi.stubGlobal('fetch', gh)
    const r = await post({
      message: 'It broke',
      context: { screen: 'home' },
      logs: 'x'.repeat(5000),
    })
    expect(r).toEqual({
      status: 200,
      body: { ok: true, url: 'https://github.com/o/r/issues/9' },
    })
    expect(gh).toHaveBeenCalledTimes(1)
  })
  it('is disabled (503) without the token or its limiter — the site then falls back', async () => {
    const gh = vi.fn()
    vi.stubGlobal('fetch', gh)
    expect(
      (await post({ message: 'x' }, { ...env, GH_TOKEN: undefined })).status,
    ).toBe(503)
    expect(
      (await post({ message: 'x' }, { ...env, BUG_LIMITER: undefined })).status,
    ).toBe(503)
    expect(gh).not.toHaveBeenCalled()
  })
  it('rate limits, validates and caps', async () => {
    const gh = vi.fn()
    vi.stubGlobal('fetch', gh)
    const limited = {
      ...env,
      BUG_LIMITER: { limit: async () => ({ success: false }) },
    }
    expect((await post({ message: 'x' }, limited)).status).toBe(429)
    expect((await post({ message: '' })).status).toBe(400)
    expect(
      (await post(JSON.stringify({ message: 'x'.repeat(30_000) }))).status,
    ).toBe(413)
    expect(gh).not.toHaveBeenCalled()
  })
  it('other routes keep the small body cap', async () => {
    const res = await worker.fetch(
      new Request('https://api.test/me', {
        method: 'POST',
        headers: { Origin: ORIGINS[0] },
        body: JSON.stringify({ token: 'a'.repeat(48), pad: 'x'.repeat(5000) }),
      }),
      env,
      {},
    )
    expect(res.status).toBe(413)
  })
  it('stops at the global daily cap without calling GitHub', async () => {
    const gh = vi.fn(async () => ({
      ok: true,
      json: async () => ({ html_url: '' }),
    }))
    vi.stubGlobal('fetch', gh)
    const e = { ...env, DB: freshDb() }
    let last
    for (let i = 0; i < 101; i++) last = await post({ message: 'x' }, e)
    expect(last.status).toBe(429)
    expect(gh).toHaveBeenCalledTimes(100)
  })
  it('a GitHub failure is a 502, not a crash', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, text: async () => 'oops' })),
    )
    expect((await post({ message: 'x' })).status).toBe(502)
    vi.restoreAllMocks()
  })
})
