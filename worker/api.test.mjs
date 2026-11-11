import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
// node:sqlite needs Node >= 22.5 (package.json `engines`).
import { DatabaseSync } from 'node:sqlite'
import worker from './api.mjs'
import {
  validateScore,
  validateName,
  validateUsername,
  scoreForMarks,
  advanceStreak,
  validDateKeys,
  safeEqual,
  ensurePlayer,
  submitAndRank,
  readBoard,
  pruneIfDue,
  pruneOrphanPlayers,
  registerAccount,
  MAX_TOKENS_PER_ACCOUNT,
} from './api-lib.mjs'

/** Minimal D1-shaped adapter over node:sqlite running the REAL migrations. */
function d1(db) {
  const wrap = (sql, args) => ({
    all: () => db.prepare(sql).all(...args),
    run: () => {
      const info = db.prepare(sql).run(...args)
      return { meta: { changes: Number(info.changes) } }
    },
    first: () => db.prepare(sql).all(...args)[0] ?? null,
  })
  return {
    prepare: (sql) => ({
      ...wrap(sql, []),
      bind: (...args) => wrap(sql, args),
    }),
    batch: async (stmts) => stmts.map((s) => ({ results: s.all() })),
  }
}
function freshDb() {
  const raw = new DatabaseSync(':memory:')
  const dir = new URL('./migrations/', import.meta.url)
  for (const f of readdirSync(dir).sort())
    raw.exec(readFileSync(new URL(f, dir), 'utf8'))
  return d1(raw)
}

const tok = (c) => c.repeat(48)
const PASS = 'ab'.repeat(32)
const today = () => new Date().toISOString().slice(0, 10)

let db
let env
beforeEach(() => {
  db = freshDb()
  const allow = { limit: async () => ({ success: true }) }
  env = {
    DB: db,
    ALLOWED_ORIGIN: 'https://example.test',
    RATE_LIMITER: allow,
    LOGIN_LIMITER: allow,
  }
})

async function post(path, body, e = env, origin = 'https://example.test') {
  const res = await worker.fetch(
    new Request('https://api.test' + path, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    e,
    { waitUntil: () => {} },
  )
  return { status: res.status, body: await res.json() }
}

describe('validation', () => {
  const now = new Date('2026-11-11T12:00:00Z')
  const good = {
    token: tok('a'),
    board: 'nfl',
    date: '2026-11-11',
    marks: '43210',
    score: 250,
  }

  it('accepts a consistent submission', () => {
    expect(validateScore(good, now).ok).toBe(true)
  })
  it('rejects a score that does not match the marks', () => {
    expect(validateScore({ ...good, score: 500 }, now).error).toBe(
      'invalid score',
    )
  })
  it('rejects bad marks, boards, tokens and far-away dates', () => {
    expect(validateScore({ ...good, marks: '4321' }, now).ok).toBe(false)
    expect(validateScore({ ...good, marks: '43215', score: 250 }, now).ok).toBe(
      false,
    )
    expect(validateScore({ ...good, board: 'mlb' }, now).ok).toBe(false)
    expect(validateScore({ ...good, token: 'short' }, now).ok).toBe(false)
    expect(validateScore({ ...good, date: '2026-11-20' }, now).ok).toBe(false)
    expect(validateScore({ ...good, date: '2026-02-30' }, now).ok).toBe(false)
  })
  it('date window is UTC today −2..+1', () => {
    expect([...validDateKeys(now)].sort()).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
    ])
  })
  it('scoreForMarks adds the ladder', () => {
    expect(scoreForMarks('44444')).toBe(500)
    expect(scoreForMarks('00000')).toBe(0)
    expect(scoreForMarks('43210')).toBe(250)
  })
  it('names: trimmed, length-checked, charset-checked, filtered', () => {
    expect(validateName('  Spicy   Al ').value).toBe('Spicy Al')
    expect(validateName('A').ok).toBe(false)
    expect(validateName('x'.repeat(21)).ok).toBe(false)
    expect(validateName('<script>').ok).toBe(false)
    expect(validateName('F.u.c.k You').ok).toBe(false)
    expect(validateName("D'Angelo O-Neal Jr.").ok).toBe(true)
    expect(validateName('José Peña').ok).toBe(true)
  })
  it('names: lookalikes, fullwidth forms and leetspeak do not beat the filter', () => {
    expect(validateName('ｆｕｃｋ you').ok).toBe(false) // fullwidth → NFKC
    expect(validateName('sh1t head').ok).toBe(false) // leet
    expect(validateName('f\u00fack').ok).toBe(false) // accent folded
    expect(validateName('\u0455hit').ok).toBe(false) // Cyrillic ѕ: not Latin
    expect(validateName('\u0410dmin').ok).toBe(false) // Cyrillic А lookalike
    expect(validateName('a\u200bb').ok).toBe(false) // zero-width space
    expect(validateName('Ａｌ').value).toBe('Al') // fullwidth is normalised
    expect(validateName('Player 1').ok).toBe(true)
  })
  it('usernames are lowercased and restricted', () => {
    expect(validateUsername(' SpicyAl_1 ').value).toBe('spicyal_1')
    expect(validateUsername('ab').ok).toBe(false)
    expect(validateUsername('has space').ok).toBe(false)
  })
  it('safeEqual compares hex strings', () => {
    expect(safeEqual('abcd', 'abcd')).toBe(true)
    expect(safeEqual('abcd', 'abce')).toBe(false)
    expect(safeEqual('abcd', 'abc')).toBe(false)
  })
})

describe('advanceStreak', () => {
  it('starts, continues, holds and resets', () => {
    const a = advanceStreak(null, '2026-11-11')
    expect(a).toMatchObject({ current: 1, best: 1 })
    const b = advanceStreak(a, '2026-11-12')
    expect(b).toMatchObject({ current: 2, best: 2 })
    expect(advanceStreak(b, '2026-11-12')).toMatchObject({ current: 2 })
    expect(advanceStreak(b, '2026-11-14')).toMatchObject({
      current: 1,
      best: 2,
    })
    // An older day never rewinds it.
    expect(advanceStreak(b, '2026-11-10')).toMatchObject({
      current: 2,
      last_played_date: '2026-11-12',
    })
  })
})

describe('scores + board (real SQL)', () => {
  const NOW = 1_800_000_000_000
  const day = '2026-11-11'
  const sub = async (t, score, marks, at = NOW) => {
    const p = await ensurePlayer(db, tok(t), at)
    return submitAndRank(
      db,
      { board: 'nfl', date: day, score, marks },
      p.id,
      at,
    )
  }

  it('the first result stands; a replay cannot improve it', async () => {
    expect(await sub('a', 250, '43210')).toMatchObject({
      score: 250,
      rank: 1,
      total: 1,
    })
    expect(await sub('a', 500, '44444')).toMatchObject({
      score: 250,
      rank: 1,
      total: 1,
    })
  })
  it('ties share a rank; the board orders ties by who finished first', async () => {
    await sub('a', 300, '44400', NOW)
    await sub('b', 500, '44444', NOW + 1)
    expect(await sub('c', 300, '44400', NOW + 2)).toMatchObject({
      rank: 2,
      total: 3,
    })
    const me = await ensurePlayer(db, tok('c'), NOW)
    const board = await readBoard(db, 'nfl', day, me.id)
    expect(board.total).toBe(3)
    expect(board.entries.map((e) => e.score)).toEqual([500, 300, 300])
    expect(board.entries[2].you).toBe(true)
    expect(board.entries[0].name).toBe('Anonymous')
    // Nothing identifying leaks.
    expect(Object.keys(board.entries[0]).sort()).toEqual([
      'marks',
      'name',
      'score',
      'streak',
    ])
  })
  it('boards are independent per mode and day', async () => {
    await sub('a', 300, '44400')
    expect((await readBoard(db, 'nba', day)).total).toBe(0)
    expect((await readBoard(db, 'nfl', '2026-11-12')).total).toBe(0)
  })
  it('a second concurrent register on the same player is refused, not faked', async () => {
    const p = await ensurePlayer(db, tok('a'), NOW)
    // Both requests read the player before either wrote (username still null).
    expect((await registerAccount(db, p, 'first_one', PASS)).ok).toBe(true)
    const second = await registerAccount(db, p, 'second_one', PASS)
    expect(second).toMatchObject({ ok: false, status: 409 })
    expect(
      db
        .prepare('SELECT username FROM players WHERE id = ?1')
        .bind(p.id)
        .first().username,
    ).toBe('first_one')
  })
  it('prunes stale anonymous players with nothing to their name, and only those', async () => {
    const OLD = NOW - 90 * 86_400_000
    await ensurePlayer(db, tok('a'), OLD) // stale, empty → pruned
    await sub('b', 100, '40000', OLD) // stale but has a score → kept
    const acct = await ensurePlayer(db, tok('c'), OLD) // stale but an account → kept
    await registerAccount(db, acct, 'keeper', PASS)
    await ensurePlayer(db, tok('d'), NOW) // empty but recent → kept
    expect(await pruneOrphanPlayers(db, NOW - 30 * 86_400_000)).toBe(1)
    expect(db.prepare('SELECT COUNT(*) AS n FROM players').first().n).toBe(3)
    expect(db.prepare('SELECT COUNT(*) AS n FROM tokens').first().n).toBe(3)
  })
  it('pruneIfDue runs once per UTC day', async () => {
    const now = new Date('2026-11-11T00:00:00Z')
    expect(await pruneIfDue(db, now)).toBe(0)
    expect(await pruneIfDue(db, now)).toBeNull()
  })
})

describe('worker routes', () => {
  it('fails closed without a rate limiter and rejects foreign origins', async () => {
    expect(
      (
        await post(
          '/me',
          { token: tok('a') },
          { ...env, RATE_LIMITER: undefined },
        )
      ).status,
    ).toBe(503)
    expect(
      (await post('/me', { token: tok('a') }, env, 'https://evil.test')).status,
    ).toBe(403)
  })
  it('429s when rate limited', async () => {
    const e = {
      ...env,
      RATE_LIMITER: { limit: async () => ({ success: false }) },
    }
    expect((await post('/me', { token: tok('a') }, e)).status).toBe(429)
  })
  it('score → board → name round trip', async () => {
    const date = today()
    const s = await post('/score', {
      token: tok('a'),
      board: 'mixed',
      date,
      score: 500,
      marks: '44444',
    })
    expect(s.body).toMatchObject({
      ok: true,
      rank: 1,
      total: 1,
      streak: { current: 1, best: 1 },
    })
    expect(
      (await post('/name', { token: tok('a'), name: 'Spicy Al' })).body.name,
    ).toBe('Spicy Al')
    const b = await post('/board', { board: 'mixed', date, token: tok('a') })
    expect(b.body.entries).toEqual([
      { name: 'Spicy Al', score: 500, marks: '44444', streak: 1, you: true },
    ])
  })
  it('register, then log in from another device and keep the same player', async () => {
    const date = today()
    await post('/score', {
      token: tok('a'),
      board: 'nfl',
      date,
      score: 100,
      marks: '40000',
    })
    const reg = await post('/register', {
      token: tok('a'),
      username: 'SpicyAl',
      pass: PASS,
    })
    expect(reg.body).toMatchObject({
      ok: true,
      username: 'spicyal',
      name: 'spicyal',
    })
    // Same username again, and re-registering the same device, both refuse.
    expect(
      (
        await post('/register', {
          token: tok('b'),
          username: 'spicyal',
          pass: PASS,
        })
      ).status,
    ).toBe(409)
    expect(
      (
        await post('/register', {
          token: tok('a'),
          username: 'other',
          pass: PASS,
        })
      ).status,
    ).toBe(409)

    expect(
      (await post('/login', { username: 'spicyal', pass: 'cd'.repeat(32) }))
        .status,
    ).toBe(401)
    expect(
      (await post('/login', { username: 'nobody', pass: PASS })).status,
    ).toBe(401)
    const login = await post('/login', { username: 'spicyal', pass: PASS })
    expect(login.status).toBe(200)
    const newToken = login.body.token
    expect(newToken).toMatch(/^[0-9a-f]{48}$/)
    // The new device sees the account's existing score as its own.
    const b = await post('/board', { board: 'nfl', date, token: newToken })
    expect(b.body.entries[0]).toMatchObject({ score: 100, you: true })

    await post('/logout', { token: newToken })
    expect((await post('/me', { token: newToken })).body.username).toBeNull()
    // The original device is still signed in.
    expect((await post('/me', { token: tok('a') })).body.username).toBe(
      'spicyal',
    )
  })
  it('caps device sessions per account', async () => {
    await post('/register', { token: tok('a'), username: 'capped', pass: PASS })
    for (let i = 0; i < MAX_TOKENS_PER_ACCOUNT + 3; i++)
      await post('/login', { username: 'capped', pass: PASS })
    const n = db.prepare('SELECT COUNT(*) AS n FROM tokens').first().n
    expect(n).toBe(MAX_TOKENS_PER_ACCOUNT)
  })
  it('login is gated by its own limiter', async () => {
    const e = {
      ...env,
      LOGIN_LIMITER: { limit: async () => ({ success: false }) },
    }
    expect(
      (await post('/login', { username: 'spicyal', pass: PASS }, e)).status,
    ).toBe(429)
    expect(
      (
        await post(
          '/login',
          { username: 'spicyal', pass: PASS },
          { ...env, LOGIN_LIMITER: undefined },
        )
      ).status,
    ).toBe(503)
  })
  it('rejects garbage', async () => {
    expect((await post('/nope', {})).status).toBe(404)
    expect((await post('/name', { token: tok('a'), name: 'x' })).status).toBe(
      400,
    )
    expect(
      (
        await post('/score', {
          token: tok('a'),
          board: 'nfl',
          date: today(),
          score: 500,
          marks: '00000',
        })
      ).status,
    ).toBe(400)
  })
})
