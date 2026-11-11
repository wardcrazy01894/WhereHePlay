// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.stubEnv('VITE_API_ENDPOINT', 'https://api.test')
const { BugReport } = await import('./BugReport')

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
const ctx = { screen: 'home', date: '2026-11-11' }
const type = (text: string) =>
  fireEvent.change(screen.getByRole('textbox'), { target: { value: text } })

describe('BugReport', () => {
  it('cannot send an empty report', () => {
    render(<BugReport context={ctx} onClose={() => {}} />)
    expect(
      (screen.getByRole('button', { name: 'Send report' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })
  it('sends and links to the filed issue', async () => {
    const f = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        url: 'https://github.com/wardcrazy01894/WhereHePlay/issues/3',
      }),
    }))
    vi.stubGlobal('fetch', f)
    render(<BugReport context={ctx} onClose={() => {}} />)
    type('Wrong college')
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }))
    const link = await screen.findByRole('link', { name: 'View it on GitHub' })
    expect(link.getAttribute('href')).toBe(
      'https://github.com/wardcrazy01894/WhereHePlay/issues/3',
    )
    expect(
      JSON.parse(
        String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body),
      ).logs,
    ).toBeTypeOf('string')
  })
  it('when sending fails, keeps the text and offers the prefilled issue link', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })),
    )
    render(<BugReport context={ctx} onClose={() => {}} />)
    type('Wrong college')
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }))
    const link = await screen.findByRole('link', {
      name: /prefilled GitHub issue/,
    })
    expect(link.getAttribute('href')).toContain(
      '/issues/new?title=%5Bbug%5D%20Wrong%20college',
    )
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'Wrong college',
    )
  })
  it('the log checkbox controls whether logs are sent', async () => {
    const f = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, url: '' }),
    }))
    vi.stubGlobal('fetch', f)
    render(<BugReport context={ctx} onClose={() => {}} />)
    type('x')
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }))
    await screen.findByText(/your report was filed/)
    expect(
      JSON.parse(
        String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body),
      ).logs,
    ).toBe('')
  })
})
