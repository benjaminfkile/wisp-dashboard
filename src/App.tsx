import { useState } from 'react'
import HealthIndicator from './components/HealthIndicator'
import SettingsPanel from './components/SettingsPanel'

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">
          <span className="app__title-mark">◇</span> Wisp Dashboard
        </h1>
        <div className="app__header-actions">
          <HealthIndicator />
          <button
            type="button"
            className="icon-btn"
            aria-label="Settings"
            title="Settings"
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(true)}
          >
            <span aria-hidden="true">⚙</span>
          </button>
        </div>
      </header>

      <main className="app__main">
        <div className="placeholder">
          <h2>Lease management is coming next.</h2>
          <p>
            This is the app shell. It talks to a running wisp instance through the
            same-origin <code>/wisp</code> dev proxy. The header indicator polls{' '}
            <code>/wisp/healthz</code> to prove the proxy works end to end.
          </p>
        </div>
      </main>

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
