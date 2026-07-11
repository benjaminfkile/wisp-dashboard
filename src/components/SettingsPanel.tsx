import { useEffect, useState } from 'react'
import { useSettings } from '../hooks/useSettings'

interface SettingsPanelProps {
  /** Close the panel (e.g. backdrop click, ✕, or Escape). */
  onClose: () => void
}

/**
 * Modal to view/edit the wisp app token. The token is masked (password-style)
 * with a show/hide toggle, plus Save and Clear actions. Persisted locally via
 * `useSettings` (localStorage).
 */
export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { appToken, setAppToken } = useSettings()
  const [draft, setDraft] = useState(appToken)
  const [reveal, setReveal] = useState(false)

  // Keep the draft in sync if the stored token changes while open.
  useEffect(() => {
    setDraft(appToken)
  }, [appToken])

  // Close on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function save() {
    setAppToken(draft.trim())
    onClose()
  }

  function clear() {
    setDraft('')
    setAppToken('')
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings__head">
          <h2 id="settings-title" className="settings__title">
            Settings
          </h2>
          <button
            type="button"
            className="settings__close"
            aria-label="Close settings"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <label className="settings__label" htmlFor="wisp-app-token">
          Wisp app token
        </label>
        <div className="settings__field">
          <input
            id="wisp-app-token"
            className="settings__input"
            type={reveal ? 'text' : 'password'}
            value={draft}
            spellCheck={false}
            autoComplete="off"
            placeholder="paste app token…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
            }}
          />
          <button
            type="button"
            className="settings__toggle"
            aria-pressed={reveal}
            onClick={() => setReveal((v) => !v)}
          >
            {reveal ? 'Hide' : 'Show'}
          </button>
        </div>

        <p className="settings__hint">
          Stored locally in this browser (localStorage). Only needed if the wisp
          instance has <code>WISP_APP_TOKEN</code> set — otherwise leave it
          blank.
        </p>

        <div className="settings__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={clear}
          >
            Clear
          </button>
          <button type="button" className="btn btn--accent" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
