import HealthIndicator from './components/HealthIndicator'

export default function App() {
  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">
          <span className="app__title-mark">◇</span> Wisp Dashboard
        </h1>
        <HealthIndicator />
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
    </div>
  )
}
