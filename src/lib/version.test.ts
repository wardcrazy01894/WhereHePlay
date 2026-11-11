import { describe, it, expect, vi } from 'vitest'
import { fetchDeployedHash, shouldReload } from './version'

describe('shouldReload', () => {
  const base = {
    current: 'aaa1111',
    deployed: 'bbb2222',
    attempted: null,
    safe: true,
  }
  it('reloads when a different build is deployed and the screen is safe', () => {
    expect(shouldReload(base)).toBe(true)
  })
  it('does nothing when the deployed build is the running one, or unknown', () => {
    expect(shouldReload({ ...base, deployed: 'aaa1111' })).toBe(false)
    expect(shouldReload({ ...base, deployed: null })).toBe(false)
  })
  it('never interrupts a game in progress', () => {
    expect(shouldReload({ ...base, safe: false })).toBe(false)
  })
  it('reloads at most once per deployed build (no loop while a CDN still serves the old page)', () => {
    expect(shouldReload({ ...base, attempted: 'bbb2222' })).toBe(false)
    // …but a later, newer build gets its own attempt.
    expect(
      shouldReload({ ...base, deployed: 'ccc3333', attempted: 'bbb2222' }),
    ).toBe(true)
  })
  it('is off in local development', () => {
    expect(shouldReload({ ...base, current: 'dev' })).toBe(false)
    expect(shouldReload({ ...base, current: '' })).toBe(false)
  })
})

describe('fetchDeployedHash', () => {
  it('asks for version.json next to the app, bypassing every cache', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ hash: 'bbb2222' }),
    }))
    expect(
      await fetchDeployedHash('/WhereHePlay/', fetchImpl as never, 123),
    ).toBe('bbb2222')
    expect(fetchImpl).toHaveBeenCalledWith('/WhereHePlay/version.json?t=123', {
      cache: 'no-store',
    })
  })
  it('returns null — never throws — on an HTTP error, bad JSON, a bad shape or a network failure', async () => {
    const cases = [
      async () => ({ ok: false, json: async () => ({}) }),
      async () => ({
        ok: true,
        json: async () => {
          throw new Error('not json')
        },
      }),
      async () => ({ ok: true, json: async () => ({ hash: 42 }) }),
      async () => {
        throw new Error('offline')
      },
    ]
    for (const c of cases)
      expect(await fetchDeployedHash('/', c as never)).toBeNull()
  })
})
