import { useEffect, useRef, useState } from 'react'
import type { BusEvent } from '../wisp/types'

/** Connection state of the events WebSocket. */
export type StreamStatus = 'connecting' | 'open' | 'closed'

/** One received bus message plus the client time it was received. */
export interface StreamEvent<T = Record<string, unknown>> {
  /** Monotonic-ish local id for React keys (receipt order). */
  id: number
  /** Client clock (`Date.now()`) when the message arrived. */
  receivedAt: number
  event: BusEvent<T>
}

export interface EventStream<T = Record<string, unknown>> {
  events: StreamEvent<T>[]
  status: StreamStatus
  /**
   * True when the socket closed almost immediately without ever delivering a
   * message — a strong hint that the app token is missing / rejected.
   */
  likelyUnauthorized: boolean
}

/** Reconnect backoff schedule (ms), capped at the last value. */
const BACKOFF_MS = [1000, 2000, 4000, 8000]

/** Closing sooner than this after opening looks like an auth rejection. */
const IMMEDIATE_CLOSE_MS = 1500

/**
 * Manage a WebSocket to the wisp events bus with auto-reconnect.
 *
 * Connects to `url` on mount, parses each text message as JSON into a
 * `BusEvent`, and accumulates them (newest first) up to `maxEvents`. Exposes a
 * live connection `status`, auto-reconnects with a small backoff on close, and
 * cleans up on unmount or when `url` changes.
 *
 * Pass `url = null` to stay disconnected (e.g. before settings are ready).
 */
export function useEventStream<T = Record<string, unknown>>(
  url: string | null,
  maxEvents = 200,
): EventStream<T> {
  const [events, setEvents] = useState<StreamEvent<T>[]>([])
  const [status, setStatus] = useState<StreamStatus>(url ? 'connecting' : 'closed')
  const [likelyUnauthorized, setLikelyUnauthorized] = useState(false)

  // Incrementing key source for received events.
  const seq = useRef(0)

  useEffect(() => {
    if (!url) {
      setStatus('closed')
      return
    }

    let ws: WebSocket | null = null
    let closedByUs = false
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    let attempt = 0
    // Reset the auth hint each time a fresh url is wired up.
    setLikelyUnauthorized(false)

    const connect = () => {
      setStatus('connecting')
      let openedAt = 0
      let sawMessage = false

      try {
        ws = new WebSocket(url)
      } catch {
        scheduleReconnect()
        return
      }

      ws.onopen = () => {
        openedAt = Date.now()
        attempt = 0
        setStatus('open')
      }

      ws.onmessage = (ev) => {
        sawMessage = true
        setLikelyUnauthorized(false)
        let parsed: BusEvent<T>
        try {
          parsed = JSON.parse(String(ev.data)) as BusEvent<T>
        } catch {
          return // Ignore non-JSON frames.
        }
        const entry: StreamEvent<T> = {
          id: seq.current++,
          receivedAt: Date.now(),
          event: parsed,
        }
        setEvents((prev) => {
          const next = [entry, ...prev]
          return next.length > maxEvents ? next.slice(0, maxEvents) : next
        })
      }

      ws.onclose = () => {
        if (closedByUs) return
        // An immediate close with no message ever received is the classic
        // signature of a missing/invalid app token being rejected.
        const openMs = openedAt ? Date.now() - openedAt : 0
        if (!sawMessage && (openedAt === 0 || openMs < IMMEDIATE_CLOSE_MS)) {
          setLikelyUnauthorized(true)
        }
        setStatus('closed')
        scheduleReconnect()
      }

      ws.onerror = () => {
        // `onclose` follows and drives reconnect; nothing to do here.
      }
    }

    const scheduleReconnect = () => {
      if (closedByUs) return
      const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]
      attempt += 1
      reconnectTimer = setTimeout(connect, delay)
    }

    connect()

    return () => {
      closedByUs = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (ws) {
        ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null
        try {
          ws.close()
        } catch {
          // Already closing/closed — ignore.
        }
      }
    }
  }, [url, maxEvents])

  return { events, status, likelyUnauthorized }
}
