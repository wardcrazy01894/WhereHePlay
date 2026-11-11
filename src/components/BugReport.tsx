import { useState } from 'react'
import {
  type ReportContext,
  type SubmitResult,
  MAX_REPORT_CHARS,
  submitBugReport,
} from '../lib/report'

interface Props {
  context: ReportContext
  onClose: () => void
}

/**
 * "Report a bug": type what went wrong and send. It becomes a GitHub issue
 * automatically; if that can't happen the dialog offers a prefilled issue
 * link, so a report is never just lost.
 */
export function BugReport({ context, onClose }: Props) {
  const [message, setMessage] = useState('')
  const [includeLogs, setIncludeLogs] = useState(true)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<SubmitResult | null>(null)

  const send = async () => {
    setBusy(true)
    setResult(await submitBugReport(message, context, includeLogs))
    setBusy(false)
  }

  return (
    <div
      className="dialog-backdrop"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Report a bug"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Report a bug</h2>
        {result?.ok ? (
          <p role="status">
            Thanks — your report was filed.{' '}
            {result.url && (
              <a href={result.url} target="_blank" rel="noreferrer">
                View it on GitHub
              </a>
            )}
          </p>
        ) : (
          <>
            <label className="field">
              <span>
                What went wrong? (A wrong college or conference? Say who.)
              </span>
              <textarea
                value={message}
                rows={5}
                autoFocus
                maxLength={MAX_REPORT_CHARS}
                onChange={(e) => {
                  setMessage(e.target.value)
                  setResult(null)
                }}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={includeLogs}
                onChange={(e) => setIncludeLogs(e.target.checked)}
              />
              <span>
                Include this session’s app log (errors and app events — no names
                or passwords). Reports are posted publicly on GitHub, with the
                page address and your browser type.
              </span>
            </label>
            {result && !result.ok && (
              <p className="dialog-message" role="status">
                Couldn’t send it automatically.{' '}
                <a href={result.fallbackUrl} target="_blank" rel="noreferrer">
                  Open a prefilled GitHub issue instead
                </a>
                .
              </p>
            )}
            <button
              type="button"
              className="primary"
              disabled={busy || message.trim() === ''}
              onClick={send}
            >
              {busy ? 'Sending…' : 'Send report'}
            </button>
          </>
        )}
        <button type="button" className="quiet close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
