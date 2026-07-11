// Typed HTTP/WebSocket client for the wisp broker API.
// Mirrors docs/WISP_API.md and reuses the shapes from ./types.
// Every call is a SAME-ORIGIN request under `/wisp` (Vite proxies it), so the
// browser never hits CORS. URL/string builders here do NOT open sockets or SSE
// streams — later tasks consume them.

import type {
  ContractStatusResponse,
  CreateContractRequest,
  CreateContractResponse,
  ExecResponse,
  ImagesResponse,
  PublishEventRequest,
} from './types'

/** Base path for the same-origin wisp dev proxy. */
const BASE = '/wisp'

/**
 * Error thrown for any non-2xx wisp HTTP response. Wisp writes JSON
 * `{ "error": "..." }` with the failing status; `message` is that error string
 * (or `res.statusText` when the body is not JSON).
 */
export class WispError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'WispError'
    this.status = status
  }
}

/** Parse a non-2xx response into a WispError, reading wisp's `{error}` body. */
async function toWispError(res: Response): Promise<WispError> {
  let message = res.statusText
  try {
    const body = (await res.json()) as { error?: unknown }
    if (body && typeof body.error === 'string' && body.error) {
      message = body.error
    }
  } catch {
    // Not JSON — keep the statusText fallback.
  }
  return new WispError(res.status, message)
}

/** Perform a fetch and parse a 2xx JSON body into `T`, else throw WispError. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) throw await toWispError(res)
  return (await res.json()) as T
}

/** Build an `Authorization: Bearer` header object, or empty when no token. */
function bearer(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** `GET /wisp/healthz` — true iff the body is `{status:"ok"}`. */
export async function health(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/healthz`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return false
    const body = (await res.json()) as { status?: string }
    return body.status === 'ok'
  } catch {
    return false
  }
}

/**
 * `GET /wisp/images` — the image allow-list, default image, and operator
 * limits. Unauthenticated (no token needed).
 */
export function getImages(): Promise<ImagesResponse> {
  return request<ImagesResponse>('/images')
}

/** `POST /wisp/contracts` — requires the app token when wisp has one set. */
export function createContract(
  req: CreateContractRequest,
  appToken?: string,
): Promise<CreateContractResponse> {
  return request<CreateContractResponse>('/contracts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...bearer(appToken) },
    body: JSON.stringify(req),
  })
}

/** `GET /wisp/contracts/:id` — current contract status. */
export function getContract(id: string): Promise<ContractStatusResponse> {
  return request<ContractStatusResponse>(`/contracts/${encodeURIComponent(id)}`)
}

/** `DELETE /wisp/contracts/:id` — release the container (idempotent). */
export function deleteContract(id: string): Promise<ContractStatusResponse> {
  return request<ContractStatusResponse>(
    `/contracts/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  )
}

/** `POST /wisp/contracts/:id/exec` — run a command using the contract token. */
export function execSync(
  id: string,
  contractToken: string,
  command: string,
): Promise<ExecResponse> {
  return request<ExecResponse>(`/contracts/${encodeURIComponent(id)}/exec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...bearer(contractToken) },
    body: JSON.stringify({ command }),
  })
}

/** `POST /wisp/events` — publish an event; resolves on 202. */
export async function publishEvent(
  req: PublishEventRequest,
  appToken?: string,
): Promise<void> {
  const res = await fetch(`${BASE}/events`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...bearer(appToken),
    },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw await toWispError(res)
}

// --- URL / string builders (no I/O — later tasks open the actual streams) ---

/** Path for the streaming exec SSE endpoint. */
export function execStreamPath(id: string): string {
  return `${BASE}/contracts/${encodeURIComponent(id)}/exec?stream=1`
}

/** Same-origin WebSocket URL matching the page protocol (`ws:`/`wss:`). */
function wsOrigin(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}`
}

/** Same-origin WS URL for the shell PTY, passing the contract token as query. */
export function shellWsUrl(id: string, contractToken: string): string {
  return `${wsOrigin()}${BASE}/contracts/${encodeURIComponent(
    id,
  )}/shell?token=${encodeURIComponent(contractToken)}`
}

/** Same-origin WS URL for the events bus; app token + optional type filter. */
export function eventsWsUrl(appToken?: string, types?: string[]): string {
  const parts: string[] = []
  if (appToken) parts.push(`token=${encodeURIComponent(appToken)}`)
  if (types && types.length > 0) {
    parts.push(`type=${types.map(encodeURIComponent).join(',')}`)
  }
  const qs = parts.join('&')
  return `${wsOrigin()}${BASE}/events${qs ? `?${qs}` : ''}`
}
