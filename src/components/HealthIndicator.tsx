import { useHealth } from '../hooks/useHealth'

const LABELS: Record<string, string> = {
  connecting: 'connecting…',
  connected: 'connected',
  disconnected: 'disconnected',
}

/** Header pill showing live wisp connectivity, polled from `/wisp/healthz`. */
export default function HealthIndicator() {
  const state = useHealth(3000)
  return (
    <div className={`health health--${state}`} title="GET /wisp/healthz">
      <span className="health__dot" aria-hidden="true" />
      <span className="health__label">wisp: {LABELS[state]}</span>
    </div>
  )
}
