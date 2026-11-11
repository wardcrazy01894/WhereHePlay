/**
 * Pure helpers, validation and D1 queries for the WhereHePlay API worker.
 *
 * Kept OUT of the entry module on purpose: the Workers runtime rejects any
 * non-handler named export on the entry, and everything here is unit-tested
 * without a Worker (worker/*.test.mjs run the real migrations on node:sqlite).
 *
 * Trust model (docs/PLAN.md §Leaderboard): scores are computed in the browser,
 * so a determined cheat can post a perfect day. Anti-cheat is a non-goal; the
 * controls here stop accidents, drive-by abuse and account takeover.
 */

// One per daily game: the three modes, and each mode's beginner daily
// (`boardId` in src/types.ts).
export const BOARDS = new Set([
  'nfl',
  'nba',
  'mixed',
  'nfl-beginner',
  'nba-beginner',
  'mixed-beginner',
])
export const QUESTIONS = 5
/** Points per mark character ('4' = photo only … '1' = multiple choice). */
export const MARK_POINTS = { 4: 100, 3: 75, 2: 50, 1: 25, 0: 0 }
export const TOP_LIMIT = 50
export const RETENTION_DAYS = 400
export const MAX_TOKENS_PER_ACCOUNT = 10
/** Server half of the split KDF — small because Workers Free allows ~10 ms CPU. */
export const SERVER_KDF_ITERATIONS = 1000

// ---- CORS / origin ------------------------------------------------------------

export function allowedOrigins(env) {
  return (env.ALLOWED_ORIGIN || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
export function originAllowed(env, origin) {
  const list = allowedOrigins(env)
  return list.includes('*') || (origin && list.includes(origin))
}
export function cors(env, origin) {
  const list = allowedOrigins(env)
  const allow = list.includes('*')
    ? '*'
    : origin && list.includes(origin)
      ? origin
      : list[0] || '*'
  return {
    'Access-Control-Allow-Origin': allow,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

// ---- Dates --------------------------------------------------------------------

export function utcDateKey(now) {
  return now.toISOString().slice(0, 10)
}
export function isValidDateKey(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false
  const d = new Date(key + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === key
}
/**
 * Puzzle days accepted for a submission at `now`. The puzzle day is the
 * player's LOCAL day (UTC−12..UTC+14), and someone may finish just after
 * their midnight, so the window is [UTC today − 2, UTC today + 1].
 */
export function validDateKeys(now) {
  const DAY = 86_400_000
  return new Set(
    [-2, -1, 0, 1].map((d) => utcDateKey(new Date(now.getTime() + d * DAY))),
  )
}
export function previousDateKey(dateKey) {
  const d = new Date(dateKey + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}
export function cutoffDateKey(now, days = RETENTION_DAYS) {
  return utcDateKey(new Date(now.getTime() - days * 86_400_000))
}

// ---- Validation ---------------------------------------------------------------

const fail = (status, error) => ({ ok: false, status, error })

export function isValidToken(t) {
  return typeof t === 'string' && /^[0-9a-f]{48}$/.test(t)
}

export function scoreForMarks(marks) {
  return [...marks].reduce((sum, m) => sum + MARK_POINTS[m], 0)
}

export function validateScore(body, now = new Date()) {
  if (!isValidToken(body?.token)) return fail(400, 'invalid token')
  const board = String(body?.board ?? '')
  if (!BOARDS.has(board)) return fail(400, 'unknown board')
  const date = String(body?.date ?? '')
  if (!isValidDateKey(date) || !validDateKeys(now).has(date))
    return fail(400, 'date out of range')
  const marks = body?.marks
  if (
    typeof marks !== 'string' ||
    !new RegExp(`^[0-4]{${QUESTIONS}}$`).test(marks)
  )
    return fail(400, 'invalid marks')
  // The score must be exactly what the marks add up to.
  if (body?.score !== scoreForMarks(marks)) return fail(400, 'invalid score')
  return {
    ok: true,
    value: { token: body.token, board, date, marks, score: body.score },
  }
}

export function validateBoardQuery(body) {
  const board = String(body?.board ?? '')
  if (!BOARDS.has(board)) return fail(400, 'unknown board')
  const date = String(body?.date ?? '')
  if (!isValidDateKey(date)) return fail(400, 'invalid date')
  const token = isValidToken(body?.token) ? body.token : null
  return { ok: true, value: { board, date, token } }
}

/**
 * Words a display name or username may not contain (matched on the letters
 * only, so "f.u.c.k" and "FUCK" are caught). Deliberately short, and free of
 * short fragments that sit inside real names (Hancock, Dickinson, "Spicy"):
 * this stops the obvious, it is not a moderation system (an admin can rename by hand —
 * docs/OPERATIONS.md).
 */
const BLOCKED = [
  'fuck',
  'shit',
  'cunt',
  'nigg',
  'faggot',
  'bitch',
  'whore',
  'slut',
  'rapist',
  'nazi',
  'hitler',
  'kike',
  'porn',
  'pussy',
]
/** Digits and symbols commonly swapped in for letters. */
const LEET = {
  0: 'o',
  1: 'i',
  3: 'e',
  4: 'a',
  5: 's',
  7: 't',
  '@': 'a',
  $: 's',
  '!': 'i',
}

export function isClean(text) {
  // Fold compatibility forms (fullwidth letters) and accents, undo leetspeak,
  // then match on the bare letters. Names are Latin-script only (see
  // validateName), so lookalike letters from other scripts never get here.
  const letters = text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[0134578@$!]/g, (c) => LEET[c])
    .replace(/[^a-z]/g, '')
  return !BLOCKED.some((w) => letters.includes(w))
}

/**
 * Display name: 2–20 chars of Latin letters (accents allowed), digits, space
 * and _ . - '. NFKC first, so fullwidth and other compatibility forms become
 * plain characters; Latin-only, so a Cyrillic or Greek lookalike cannot
 * impersonate another player or slip a blocked word past the filter.
 */
export function validateName(raw) {
  if (typeof raw !== 'string') return fail(400, 'invalid name')
  const name = raw.normalize('NFKC').replace(/\s+/g, ' ').trim()
  if (name.length < 2 || name.length > 20)
    return fail(400, 'name must be 2 to 20 characters')
  if (!/^[\p{Script=Latin}0-9 _.'-]+$/u.test(name))
    return fail(400, "name can use letters, numbers, spaces and _ . - '")
  if (!isClean(name)) return fail(400, 'pick a different name')
  return { ok: true, value: name }
}

/** Username: 3–20 of a-z 0-9 _ (stored lowercased). */
export function validateUsername(raw) {
  if (typeof raw !== 'string') return fail(400, 'invalid username')
  const username = raw.trim().toLowerCase()
  if (!/^[a-z0-9_]{3,20}$/.test(username))
    return fail(400, 'username must be 3 to 20 letters, numbers or _')
  if (!isClean(username)) return fail(400, 'pick a different username')
  return { ok: true, value: username }
}

/** The client-derived password key: 64 hex chars (PBKDF2-SHA256 output). */
export function isValidPass(p) {
  return typeof p === 'string' && /^[0-9a-f]{64}$/.test(p)
}

// ---- Crypto -------------------------------------------------------------------

const hex = (buf) =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join(
    '',
  )

export async function sha256Hex(text) {
  return hex(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
  )
}
export function randomHex(bytes) {
  const b = new Uint8Array(bytes)
  crypto.getRandomValues(b)
  return hex(b)
}

/**
 * Passwords use a SPLIT KDF: the browser stretches the password (PBKDF2,
 * 150k iterations, salted with the username) and sends only that derived key;
 * the server stretches it again with a random per-account salt before
 * storing. The plaintext password never leaves the device, the expensive
 * part runs on the client (Workers Free = ~10 ms CPU), and the stored hash is
 * not directly replayable as a login.
 */
export async function hashPass(pass, saltHex) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(pass),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: enc.encode(saltHex),
      iterations: SERVER_KDF_ITERATIONS,
    },
    key,
    256,
  )
  return hex(bits)
}

/** Constant-time comparison of two equal-length hex strings. */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length)
    return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ---- Players + tokens ---------------------------------------------------------

/** The player row for a bearer token, or null. */
export async function playerForToken(db, token) {
  const row = await db
    .prepare(
      `SELECT p.id, p.name, p.username FROM tokens t
       JOIN players p ON p.id = t.player_id WHERE t.token_hash = ?1`,
    )
    .bind(await sha256Hex(token))
    .first()
  return row ?? null
}

/** Like playerForToken, but creates an anonymous player on first sight. */
export async function ensurePlayer(db, token, now) {
  const existing = await playerForToken(db, token)
  if (existing) return existing
  const tokenHash = await sha256Hex(token)
  const created = await db
    .prepare(
      `INSERT INTO players (name, created_at) VALUES ('', ?1) RETURNING id`,
    )
    .bind(now)
    .first()
  // Two first requests can race; the loser's INSERT is ignored and its
  // orphan player row is harmless (no token points at it).
  await db
    .prepare(
      `INSERT OR IGNORE INTO tokens (token_hash, player_id, created_at) VALUES (?1, ?2, ?3)`,
    )
    .bind(tokenHash, created.id, now)
    .run()
  return playerForToken(db, token)
}

export async function renamePlayer(db, playerId, name) {
  await db
    .prepare(`UPDATE players SET name = ?1 WHERE id = ?2`)
    .bind(name, playerId)
    .run()
}

/**
 * Turn the token's player into an account. Returns `{ ok }` or a 409 when the
 * player already has one or the username is taken (the UNIQUE index decides
 * races). An empty display name defaults to the username.
 */
export async function registerAccount(db, player, username, pass) {
  if (player.username) return fail(409, 'this device is already signed in')
  const taken = await db
    .prepare(`SELECT 1 AS x FROM players WHERE username = ?1`)
    .bind(username)
    .first()
  if (taken) return fail(409, 'that username is taken')
  const salt = randomHex(16)
  const hash = await hashPass(pass, salt)
  const name = player.name || username
  let changed
  try {
    const res = await db
      .prepare(
        `UPDATE players SET username = ?1, pass_salt = ?2, pass_hash = ?3, name = ?4
         WHERE id = ?5 AND username IS NULL`,
      )
      .bind(username, salt, hash, name, player.id)
      .run()
    changed = res?.meta?.changes ?? 0
  } catch {
    return fail(409, 'that username is taken')
  }
  // 0 rows: a concurrent request registered this player first.
  if (changed !== 1) return fail(409, 'this device is already signed in')
  return { ok: true, value: { name, username } }
}

/** A salt to burn equal work on when the username does not exist. */
const DUMMY_SALT = '00000000000000000000000000000000'

/**
 * Verify a login and mint a fresh token for this device. The same error and
 * the same amount of hashing whether the username exists or not.
 */
export async function loginAccount(db, username, pass, now) {
  const row = await db
    .prepare(
      `SELECT id, name, username, pass_salt, pass_hash FROM players WHERE username = ?1`,
    )
    .bind(username)
    .first()
  const hash = await hashPass(pass, row?.pass_salt ?? DUMMY_SALT)
  if (!row || !safeEqual(hash, row.pass_hash))
    return fail(401, 'wrong username or password')
  const token = randomHex(24)
  await db
    .prepare(
      `INSERT INTO tokens (token_hash, player_id, created_at) VALUES (?1, ?2, ?3)`,
    )
    .bind(await sha256Hex(token), row.id, now)
    .run()
  // Keep only the newest few device sessions per account.
  await db
    .prepare(
      `DELETE FROM tokens WHERE player_id = ?1 AND token_hash NOT IN (
         SELECT token_hash FROM tokens WHERE player_id = ?1
         ORDER BY created_at DESC, token_hash LIMIT ?2)`,
    )
    .bind(row.id, MAX_TOKENS_PER_ACCOUNT)
    .run()
  return { ok: true, value: { token, name: row.name, username: row.username } }
}

/** Sign this device out of an ACCOUNT (anonymous tokens are left alone). */
export async function logoutToken(db, token) {
  await db
    .prepare(
      `DELETE FROM tokens WHERE token_hash = ?1 AND player_id IN (
         SELECT id FROM players WHERE username IS NOT NULL)`,
    )
    .bind(await sha256Hex(token))
    .run()
}

// ---- Scores + streaks ---------------------------------------------------------

/**
 * Store the player's result for (board, date) — the FIRST one stands — and
 * return the standing of whatever is stored. Ties share a rank.
 */
export async function submitAndRank(
  db,
  { board, date, score, marks },
  playerId,
  now,
) {
  const insert = db
    .prepare(
      `INSERT OR IGNORE INTO scores (board, date, player_id, score, marks, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    )
    .bind(board, date, playerId, score, marks, now)
  const standing = db
    .prepare(
      `SELECT
         (SELECT score FROM scores WHERE board = ?1 AND date = ?2 AND player_id = ?3) AS score,
         (SELECT COUNT(*) FROM scores WHERE board = ?1 AND date = ?2 AND score >
            (SELECT score FROM scores WHERE board = ?1 AND date = ?2 AND player_id = ?3)
         ) AS better,
         (SELECT COUNT(*) FROM scores WHERE board = ?1 AND date = ?2) AS total`,
    )
    .bind(board, date, playerId)
  const results = await db.batch([insert, standing])
  const row = results[1].results[0]
  return {
    score: Number(row.score),
    rank: Number(row.better) + 1,
    total: Number(row.total),
  }
}

/** Same-day replay keeps the count, the next day adds one, a gap restarts. */
export function advanceStreak(prev, dateKey) {
  if (prev && dateKey < prev.last_played_date)
    return {
      current: prev.current,
      best: prev.best,
      last_played_date: prev.last_played_date,
    }
  let current
  if (!prev) current = 1
  else if (prev.last_played_date === dateKey) current = prev.current
  else if (prev.last_played_date === previousDateKey(dateKey))
    current = prev.current + 1
  else current = 1
  return {
    current,
    best: Math.max(prev?.best ?? 0, current),
    last_played_date: dateKey,
  }
}

export async function updateStreak(db, { board, date }, playerId, now) {
  const prev = await db
    .prepare(
      `SELECT current, best, last_played_date FROM streaks WHERE board = ?1 AND player_id = ?2`,
    )
    .bind(board, playerId)
    .first()
  const next = advanceStreak(prev, date)
  await db
    .prepare(
      `INSERT INTO streaks (board, player_id, current, best, last_played_date, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(board, player_id) DO UPDATE SET
         current = excluded.current, best = excluded.best,
         last_played_date = excluded.last_played_date, updated_at = excluded.updated_at`,
    )
    .bind(board, playerId, next.current, next.best, next.last_played_date, now)
    .run()
  return { current: next.current, best: next.best }
}

/**
 * The day's board: top TOP_LIMIT by score (earlier finisher first on ties)
 * with display names and each player's current streak (shown only on the
 * latest day they played — an older day's board shows 0, since streak history
 * is not kept), plus the caller's own row when they are outside the top. Never exposes ids,
 * usernames or tokens.
 */
export async function readBoard(db, board, date, playerId = null) {
  const cols = `p.name AS name, s.score AS score, s.marks AS marks, s.player_id AS pid,
    CASE WHEN st.last_played_date = s.date THEN st.current ELSE 0 END AS streak`
  const from = `FROM scores s JOIN players p ON p.id = s.player_id
    LEFT JOIN streaks st ON st.board = s.board AND st.player_id = s.player_id`
  const top = db
    .prepare(
      `SELECT ${cols} ${from} WHERE s.board = ?1 AND s.date = ?2
       ORDER BY s.score DESC, s.created_at ASC, s.player_id ASC LIMIT ?3`,
    )
    .bind(board, date, TOP_LIMIT)
  const count = db
    .prepare(
      `SELECT COUNT(*) AS total FROM scores WHERE board = ?1 AND date = ?2`,
    )
    .bind(board, date)
  const mine = db
    .prepare(
      `SELECT ${cols} ${from} WHERE s.board = ?1 AND s.date = ?2 AND s.player_id = ?3`,
    )
    .bind(board, date, playerId ?? -1)
  const [topRes, countRes, mineRes] = await db.batch([top, count, mine])
  const shape = (r) => ({
    name: r.name || 'Anonymous',
    score: Number(r.score),
    marks: r.marks,
    streak: Number(r.streak) || 0,
    ...(playerId != null && r.pid === playerId ? { you: true } : {}),
  })
  const entries = topRes.results.map(shape)
  const own = mineRes.results[0]
  if (own && !entries.some((e) => e.you)) entries.push(shape(own))
  return { total: Number(countRes.results[0].total) || 0, entries }
}

export async function pruneOldScores(db, cutoff) {
  const res = await db
    .prepare(`DELETE FROM scores WHERE date < ?1`)
    .bind(cutoff)
    .run()
  return res?.meta?.changes ?? 0
}

/** How long an anonymous player who never finished a daily is kept. */
export const ORPHAN_DAYS = 30

/**
 * Delete anonymous players (and their tokens) created before `cutoffMs` that
 * have no score and no streak — every first /score or /name from a new token
 * creates a row, so without this the table only grows. Accounts are never
 * touched. A pruned device simply gets a new row on its next write.
 */
export async function pruneOrphanPlayers(db, cutoffMs) {
  const orphans = `SELECT id FROM players WHERE username IS NULL AND created_at < ?1
    AND id NOT IN (SELECT player_id FROM scores)
    AND id NOT IN (SELECT player_id FROM streaks)`
  await db
    .prepare(`DELETE FROM tokens WHERE player_id IN (${orphans})`)
    .bind(cutoffMs)
    .run()
  const res = await db
    .prepare(
      `DELETE FROM players WHERE username IS NULL AND created_at < ?1
        AND id NOT IN (SELECT player_id FROM scores)
        AND id NOT IN (SELECT player_id FROM streaks)`,
    )
    .bind(cutoffMs)
    .run()
  return res?.meta?.changes ?? 0
}

/** Run the retention prune at most once per UTC day (meta.last_prune). */
export async function pruneIfDue(db, now) {
  const today = utcDateKey(now)
  const row = await db
    .prepare(`SELECT value FROM meta WHERE key = 'last_prune'`)
    .first()
  if (row?.value === today) return null
  const removed = await pruneOldScores(db, cutoffDateKey(now))
  await pruneOrphanPlayers(db, now.getTime() - ORPHAN_DAYS * 86_400_000)
  await db
    .prepare(
      `INSERT INTO meta (key, value, updated_at) VALUES ('last_prune', ?1, ?2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .bind(today, now.getTime())
    .run()
  return removed
}
