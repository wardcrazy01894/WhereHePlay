/**
 * Cloudflare Worker: WhereHePlay API — daily leaderboard, display names and
 * optional username/password accounts. All logic lives in api-lib.mjs; this
 * entry exports only `default` (the Workers runtime rejects other exports).
 *
 * Routes (all POST, JSON in/out; a token never travels in a URL):
 *   /score     { token, board, date, score, marks } → { rank, total, streak }
 *   /board     { board, date, token? }              → { total, entries[] }
 *   /me        { token }                            → { name, username }
 *   /name      { token, name }                      → { name, username }
 *   /register  { token, username, pass }            → { name, username }
 *   /login     { username, pass }                   → { token, name, username }
 *   /logout    { token }                            → {}
 *   /bug       { kind?, message, context, logs }    → { url }  (files a
 *              GitHub issue; needs the GH_TOKEN secret, else 503 and the
 *              site falls back to a prefilled issue link)
 *
 * SECURITY: public endpoint. Fails CLOSED without a rate limiter; per-IP rate
 * limit on everything plus a much tighter per-IP+username limit on /login
 * and per-IP limit on /bug; server-side Origin allowlist; small body cap;
 * strict validation; report text is defanged before it becomes an issue.
 *
 * Bindings (worker/wrangler.toml): DB (D1), ALLOWED_ORIGIN, RATE_LIMITER,
 * LOGIN_LIMITER, BUG_LIMITER, GH_REPO, and the secret GH_TOKEN (fine-grained
 * PAT: Issues read & write on this repo only).
 */

import {
  cors,
  originAllowed,
  validateScore,
  validateBoardQuery,
  validateName,
  validateUsername,
  isValidPass,
  isValidToken,
  playerForToken,
  ensurePlayer,
  renamePlayer,
  registerAccount,
  loginAccount,
  logoutToken,
  submitAndRank,
  updateStreak,
  readBoard,
  readProgress,
  pruneIfDue,
  allowedOrigins,
} from './api-lib.mjs'
import {
  MAX_BUG_BODY_BYTES,
  buildIssue,
  createIssue,
  takeDailySlot,
} from './bug-lib.mjs'

const MAX_BODY_BYTES = 2_000

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin')
    const headers = cors(env, origin)
    const reply = (obj, status = 200) => json(obj, status, headers)
    const bad = (v) => reply({ error: v.error }, v.status)

    if (request.method === 'OPTIONS') return new Response(null, { headers })
    if (request.method !== 'POST')
      return reply({ error: 'method not allowed' }, 405)

    // Fail CLOSED: never run without an anti-abuse control.
    if (!env.RATE_LIMITER)
      return reply({ error: 'api disabled: configure a rate limit' }, 503)
    if (origin && !originAllowed(env, origin))
      return reply({ error: 'forbidden origin' }, 403)
    if (!env.DB) return reply({ error: 'api unavailable' }, 503)

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
    const { success } = await env.RATE_LIMITER.limit({ key: ip })
    if (!success) return reply({ error: 'rate limited, try later' }, 429)

    const route = new URL(request.url).pathname.replace(/\/+$/, '')
    // A bug report carries a message and session logs; everything else is tiny.
    const maxBytes = route === '/bug' ? MAX_BUG_BODY_BYTES : MAX_BODY_BYTES

    // Cheap early reject on the declared size; the real check is on the bytes read.
    if (parseInt(request.headers.get('Content-Length') || '0', 10) > maxBytes)
      return reply({ error: 'payload too large' }, 413)

    let body
    try {
      const raw = await request.text()
      if (new TextEncoder().encode(raw).byteLength > maxBytes)
        return reply({ error: 'payload too large' }, 413)
      body = JSON.parse(raw)
    } catch {
      return reply({ error: 'invalid json' }, 400)
    }
    if (!body || typeof body !== 'object')
      return reply({ error: 'invalid json' }, 400)

    const now = new Date()
    const db = env.DB

    try {
      switch (route) {
        case '/score': {
          const v = validateScore(body, now)
          if (!v.ok) return bad(v)
          const player = await ensurePlayer(db, v.value.token, now.getTime())
          const standing = await submitAndRank(
            db,
            v.value,
            player.id,
            now.getTime(),
          )
          let streak
          try {
            streak = await updateStreak(db, v.value, player.id, now.getTime())
          } catch (e) {
            // Best effort: a streak failure must not fail the score.
            console.warn('streak update failed', { error: String(e) })
          }
          ctx?.waitUntil?.(
            pruneIfDue(db, now).catch((e) =>
              console.error('lazy prune failed', { error: String(e) }),
            ),
          )
          return reply({ ok: true, ...standing, streak })
        }
        case '/board': {
          const v = validateBoardQuery(body)
          if (!v.ok) return bad(v)
          const me = v.value.token
            ? await playerForToken(db, v.value.token)
            : null
          const board = await readBoard(
            db,
            v.value.board,
            v.value.date,
            me?.id ?? null,
          )
          return reply({ ok: true, ...board })
        }
        case '/me': {
          if (!isValidToken(body.token))
            return reply({ error: 'invalid token' }, 400)
          const me = await playerForToken(db, body.token)
          return reply({
            ok: true,
            name: me?.name ?? '',
            username: me?.username ?? null,
            // Cross-device sync: this player's streaks and recent results.
            ...(await readProgress(db, me?.id ?? null, now)),
          })
        }
        case '/name': {
          if (!isValidToken(body.token))
            return reply({ error: 'invalid token' }, 400)
          const v = validateName(body.name)
          if (!v.ok) return bad(v)
          const player = await ensurePlayer(db, body.token, now.getTime())
          await renamePlayer(db, player.id, v.value)
          return reply({
            ok: true,
            name: v.value,
            username: player.username ?? null,
          })
        }
        case '/register': {
          if (!isValidToken(body.token))
            return reply({ error: 'invalid token' }, 400)
          const u = validateUsername(body.username)
          if (!u.ok) return bad(u)
          if (!isValidPass(body.pass))
            return reply({ error: 'invalid password' }, 400)
          const player = await ensurePlayer(db, body.token, now.getTime())
          const r = await registerAccount(db, player, u.value, body.pass)
          if (!r.ok) return bad(r)
          return reply({ ok: true, ...r.value })
        }
        case '/login': {
          const u = validateUsername(body.username)
          if (!u.ok || !isValidPass(body.pass))
            return reply({ error: 'wrong username or password' }, 401)
          // Tight limit per IP + username: password guessing is the one
          // attack here with a real payoff. Fail closed if unconfigured.
          if (!env.LOGIN_LIMITER) return reply({ error: 'login disabled' }, 503)
          const gate = await env.LOGIN_LIMITER.limit({
            key: `${ip}|${u.value}`,
          })
          if (!gate.success)
            return reply(
              { error: 'too many attempts, try again in a minute' },
              429,
            )
          const r = await loginAccount(
            db,
            u.value,
            body.pass,
            now.getTime(),
            body.token,
          )
          if (!r.ok) return bad(r)
          return reply({ ok: true, ...r.value })
        }
        case '/logout': {
          if (!isValidToken(body.token))
            return reply({ error: 'invalid token' }, 400)
          await logoutToken(db, body.token)
          return reply({ ok: true })
        }
        case '/bug': {
          // No token configured → say so; the site then offers a prefilled
          // GitHub issue link instead.
          if (!env.GH_TOKEN || !env.GH_REPO)
            return reply({ error: 'reporting disabled' }, 503)
          // Each report becomes a public issue: fail closed without its limiter.
          if (!env.BUG_LIMITER)
            return reply({ error: 'reporting disabled' }, 503)
          const gate = await env.BUG_LIMITER.limit({ key: ip })
          if (!gate.success)
            return reply(
              { error: 'too many reports, try again in a minute' },
              429,
            )
          const issue = buildIssue(body, allowedOrigins(env))
          if (!issue.ok) return bad(issue)
          // Global daily cap. (A DB error lands in the catch → 503 → the site
          // offers the prefilled link, which is the safe direction.)
          if (!(await takeDailySlot(db, now)))
            return reply({ error: 'report limit reached for today' }, 429)
          const filed = await createIssue(env, issue.value)
          if (!filed.ok)
            return reply({ error: 'could not file the report' }, 502)
          return reply({ ok: true, url: filed.url })
        }
        default:
          return reply({ error: 'not found' }, 404)
      }
    } catch (e) {
      // D1 outage / quota: degrade gracefully (the client hides the board).
      console.error('api request failed', { route, error: String(e) })
      return reply({ error: 'api unavailable' }, 503)
    }
  },
}
