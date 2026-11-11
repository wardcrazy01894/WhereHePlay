// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import {
  cleanup,
  render,
  screen,
  fireEvent,
  within,
} from '@testing-library/react'
import type { League, Player, Tier } from './types'
import { getDateKey } from './lib/daily'

// The API client reads its endpoint when the module loads, so it has to be
// set before App is imported.
vi.hoisted(() => {
  vi.stubEnv('VITE_API_ENDPOINT', 'https://api.test')
})
const { App } = await import('./App')

const players: Player[] = []
for (const l of ['nfl', 'nba'] as League[])
  for (const t of ['easy', 'medium', 'hard'] as Tier[])
    for (let i = 0; i < 8; i++)
      players.push({
        id: `${l}-${t}-${i}`,
        n: `Player ${l} ${t} ${i}`,
        l,
        s: ['a'],
        c: 'SEC',
        y: 2010,
        t,
        h: 'x',
        d: ['b', 'c', 'd'],
      })
const schools = ['a', 'b', 'c', 'd'].map((id) => ({
  id,
  name: `School ${id.toUpperCase()}`,
}))
const TOKEN = 'ab'.repeat(24)
const BO_TOKEN = 'cd'.repeat(24)
const today = getDateKey()

/** What the account already holds, as `/me` reports it. */
let me: Record<string, unknown>
/** Flip to make the worker refuse scores. */
let scoreOk = true
let scoreStatus = 400
const posted: { path: string; body: Record<string, unknown> }[] = []

beforeEach(() => {
  localStorage.clear()
  posted.length = 0
  scoreOk = true
  scoreStatus = 400
  localStorage.setItem(
    'whp:v1:identity',
    JSON.stringify({ token: TOKEN, name: 'Al', username: 'al' }),
  )
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url)
      if (!u.startsWith('https://api.test'))
        return {
          ok: true,
          json: async () => (u.includes('players') ? players : schools),
        }
      const path = u.slice('https://api.test'.length)
      posted.push({ path, body: JSON.parse(String(init?.body ?? '{}')) })
      const body =
        path === '/me'
          ? me
          : path === '/score'
            ? { rank: 1, total: 1, streak: { current: 6, best: 6 } }
            : path === '/login'
              ? { token: BO_TOKEN, name: 'Bo', username: 'bo' }
              : { total: 0, entries: [] }
      if (path === '/score' && !scoreOk)
        return {
          ok: false,
          status: scoreStatus,
          json: async () => ({ error: 'invalid date' }),
        }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, ...body }),
      }
    }),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('cross-device sync', () => {
  it('a daily finished on another device shows as done here, with the account’s streak', async () => {
    me = {
      name: 'Al',
      username: 'al',
      scores: [{ board: 'nfl', date: today, score: 250, marks: '43210' }],
      streaks: [{ board: 'nfl', current: 6, best: 6, last: today }],
    }
    render(<App />)
    await screen.findByRole('heading', { name: 'NFL' })
    const done = await screen.findByRole('button', { name: 'Daily done · 250' })
    expect(screen.getByText('🔥 6-day streak')).toBeTruthy()
    // The other two modes are still to play.
    expect(screen.getAllByRole('button', { name: 'Play daily' })).toHaveLength(
      2,
    )
    fireEvent.click(done)
    expect(screen.getByLabelText('Result by question').textContent).toBe(
      '🟩🟨🟧🟥⬛',
    )
    expect(screen.getByText(/Played on another device/)).toBeTruthy()
  })

  it('a daily finished here before signing in is handed to the account', async () => {
    // Play NFL while the account knows nothing about today…
    me = { name: 'Al', username: 'al', scores: [], streaks: [] }
    const first = render(<App />)
    await screen.findByRole('heading', { name: 'NFL' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Play daily' })[1])
    for (let i = 0; i < 5; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'I don’t know' }))
      fireEvent.click(
        screen.getByRole('button', {
          name: i < 4 ? 'Next player' : 'See results',
        }),
      )
    }
    first.unmount()
    // …then come back later: the home screen alone sends it.
    posted.length = 0
    render(<App />)
    await screen.findByRole('button', { name: 'Daily done · 0' })
    await vi.waitFor(() =>
      expect(posted.filter((p) => p.path === '/score')).toHaveLength(1),
    )
    expect(posted.find((p) => p.path === '/score')!.body).toMatchObject({
      token: TOKEN,
      board: 'nfl',
      date: today,
      score: 0,
      marks: '00000',
    })
    expect(await screen.findByText('🔥 6-day streak')).toBeTruthy()
  })

  /** Finish today's NFL daily with five "I don't know"s. */
  const playNfl = () => {
    fireEvent.click(screen.getAllByRole('button', { name: 'Play daily' })[1])
    for (let i = 0; i < 5; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'I don’t know' }))
      fireEvent.click(
        screen.getByRole('button', {
          name: i < 4 ? 'Next player' : 'See results',
        }),
      )
    }
  }
  const scorePosts = () => posted.filter((p) => p.path === '/score').length

  it('a day played as one account is never handed to another', async () => {
    me = { name: 'Al', username: 'al', scores: [], streaks: [] }
    const first = render(<App />)
    await screen.findByRole('heading', { name: 'NFL' })
    playNfl()
    await vi.waitFor(() => expect(scorePosts()).toBeGreaterThan(0))
    first.unmount()
    // Same device, now signed in as someone else who has not played today.
    localStorage.setItem(
      'whp:v1:identity',
      JSON.stringify({ token: 'cd'.repeat(24), name: 'Bo', username: 'bo' }),
    )
    me = { name: 'Bo', username: 'bo', scores: [], streaks: [] }
    posted.length = 0
    render(<App />)
    await screen.findByRole('heading', { name: 'NFL' })
    await vi.waitFor(() =>
      expect(posted.some((p) => p.path === '/me')).toBe(true),
    )
    await new Promise((r) => setTimeout(r, 20))
    expect(scorePosts()).toBe(0)
  })

  it('with the results on screen: signing in claims an unowned day once; signing out never reposts it', async () => {
    // An anonymous device finishes the day…
    localStorage.setItem(
      'whp:v1:identity',
      JSON.stringify({ token: TOKEN, name: '' }),
    )
    me = { name: '', username: null, scores: [], streaks: [] }
    render(<App />)
    await screen.findByRole('heading', { name: 'NFL' })
    playNfl()
    await vi.waitFor(() => expect(scorePosts()).toBe(1))
    const key = `whp:v1:daily:nfl:${today}`
    expect(JSON.parse(localStorage.getItem(key)!).owner).toBeUndefined()
    // …then signs in as Bo without leaving the results: the day becomes Bo's.
    fireEvent.click(screen.getByRole('button', { name: /Set name/ }))
    const dialog = screen.getByRole('dialog', { name: 'Your profile' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign in' }))
    fireEvent.change(within(dialog).getByLabelText('Username'), {
      target: { value: 'bo' },
    })
    fireEvent.change(within(dialog).getByLabelText('Password'), {
      target: { value: 'correct horse' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign in' }))
    await vi.waitFor(() => expect(scorePosts()).toBe(2), { timeout: 5000 })
    await vi.waitFor(() =>
      expect(JSON.parse(localStorage.getItem(key)!).owner).toBe('bo'),
    )
    // Signing out (a fresh anonymous token) must not post Bo's day again.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign out' }))
    await vi.waitFor(() =>
      expect(posted.some((p) => p.path === '/logout')).toBe(true),
    )
    await within(dialog).findByText('Signed out.')
    await new Promise((r) => setTimeout(r, 20))
    expect(
      posted.filter((p) => p.path === '/score').map((p) => p.body.token),
    ).toEqual([TOKEN, BO_TOKEN])
  })

  it('a hand-over that failed in transit (no answer, 5xx) is tried again', async () => {
    me = { name: 'Al', username: 'al', scores: [], streaks: [] }
    scoreOk = false
    scoreStatus = 503
    const first = render(<App />)
    await screen.findByRole('heading', { name: 'NFL' })
    playNfl()
    first.unmount()
    posted.length = 0
    render(<App />)
    await screen.findByRole('button', { name: 'Daily done · 0' })
    await vi.waitFor(() => expect(scorePosts()).toBe(1))
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(scorePosts()).toBe(2))
  })

  it('a refused hand-over is not retried on every visit', async () => {
    me = { name: 'Al', username: 'al', scores: [], streaks: [] }
    scoreOk = false
    const first = render(<App />)
    await screen.findByRole('heading', { name: 'NFL' })
    playNfl()
    first.unmount()
    posted.length = 0
    render(<App />)
    await screen.findByRole('button', { name: 'Daily done · 0' })
    await vi.waitFor(() => expect(scorePosts()).toBe(1))
    // The tab comes back, twice: /me is asked again, the score is not.
    for (let i = 0; i < 2; i++) {
      const before = posted.filter((p) => p.path === '/me').length
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.waitFor(() =>
        expect(posted.filter((p) => p.path === '/me').length).toBe(before + 1),
      )
      await new Promise((r) => setTimeout(r, 20))
    }
    expect(scorePosts()).toBe(1)
  })

  it('a second tab that finishes the day elsewhere wins over answers typed here', async () => {
    me = { name: 'Al', username: 'al', scores: [], streaks: [] }
    render(<App />)
    await screen.findByRole('heading', { name: 'NFL' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Play daily' })[1])
    fireEvent.click(screen.getByRole('button', { name: 'I don’t know' }))
    // Another tab syncs the account's finished result into storage.
    const key = `whp:v1:daily:nfl:${today}`
    const mine = JSON.parse(localStorage.getItem(key)!)
    const done = {
      stage: 0,
      wrong: [],
      done: true,
      correct: true,
      gaveUp: false,
      points: 100,
    }
    localStorage.setItem(
      key,
      JSON.stringify({
        ...mine,
        questions: [done, done, done, done, done],
        submitted: true,
        synced: true,
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Next player' }))
    fireEvent.click(screen.getByRole('button', { name: 'I don’t know' }))
    // This tab shows the result that stands, and did not overwrite it.
    expect(screen.getByLabelText('Result by question').textContent).toBe(
      '🟩🟩🟩🟩🟩',
    )
    expect(JSON.parse(localStorage.getItem(key)!).synced).toBe(true)
  })

  it('a worker that predates sync changes nothing', async () => {
    me = { name: 'Al', username: 'al' }
    render(<App />)
    await screen.findByRole('heading', { name: 'NFL' })
    await vi.waitFor(() =>
      expect(posted.some((p) => p.path === '/me')).toBe(true),
    )
    expect(screen.getAllByRole('button', { name: 'Play daily' })).toHaveLength(
      3,
    )
    expect(posted.some((p) => p.path === '/score')).toBe(false)
  })
})
