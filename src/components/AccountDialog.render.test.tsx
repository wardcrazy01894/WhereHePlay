// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.stubEnv('VITE_API_ENDPOINT', 'https://api.test')
const { AccountDialog } = await import('./AccountDialog')

afterEach(cleanup)
const identity = { token: 'a'.repeat(48), name: '' }

describe('AccountDialog', () => {
  it('create account says plainly that the username is not an email', () => {
    render(
      <AccountDialog
        identity={identity}
        onChange={() => {}}
        onClose={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByText('Not an email.')).toBeTruthy()
    expect(screen.getByText(/never ask for or use an email/)).toBeTruthy()
    expect(screen.getByPlaceholderText('anything you like')).toBeTruthy()
  })
  it('sign in does not repeat the note', () => {
    render(
      <AccountDialog
        identity={identity}
        onChange={() => {}}
        onClose={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.queryByText('Not an email.')).toBeNull()
  })
})
