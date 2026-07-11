// TypeScript types for the wisp broker API. These mirror docs/WISP_API.md.
// This module is TYPES ONLY — the HTTP/WebSocket client is a later task.

/**
 * Contract lifecycle states.
 * Flow: requested -> provisioning -> ready -> expiring -> released | expired
 */
export type ContractStatus =
  | 'requested'
  | 'provisioning'
  | 'ready'
  | 'expiring'
  | 'released'
  | 'expired'

/** Body for `POST /contracts` (app token). `preset`, `userdata`, `meta` optional. */
export interface CreateContractRequest {
  ttl_seconds: number
  preset?: string
  userdata?: string
  meta?: Record<string, unknown>
}

/** `201` response from `POST /contracts`. `token` is the per-contract token. */
export interface CreateContractResponse {
  contract_id: string
  token: string
  status: ContractStatus
}

/** Response from `GET /contracts/:id` and `DELETE /contracts/:id`. */
export interface ContractStatusResponse {
  contract_id: string
  status: ContractStatus
  ttl_seconds_remaining: number
}

/**
 * Body for `POST /contracts/:id/exec` (contract token).
 * Each exec is a FRESH process — no shared cwd/env between calls. Use compound
 * commands (e.g. `cd /repo && git diff`) to keep state within a single call.
 */
export interface ExecRequest {
  command: string
}

/** Non-streaming response from `POST /contracts/:id/exec`. */
export interface ExecResponse {
  stdout: string
  stderr: string
  exit_code: number
}

/**
 * SSE `event: chunk` payload from `POST /contracts/:id/exec?stream=1`.
 * One per output chunk until the terminal exit event.
 */
export interface ExecStreamChunk {
  stream: 'stdout' | 'stderr'
  data: string
}

/** SSE terminal `event: exit` payload from the streaming exec. */
export interface ExecExit {
  exit_code: number
}

/** SSE `event: error` payload — a failure mid-stream. */
export interface ExecStreamError {
  error: string
}

/** Body for `POST /events` (app token). */
export interface PublishEventRequest {
  type: string
  data: Record<string, unknown>
}

/**
 * A generic event on the wisp bus, delivered as JSON over `WS /events`.
 * `data` shape depends on `type`.
 */
export interface BusEvent<T = Record<string, unknown>> {
  type: string
  data: T
}

/** The lifecycle event `type` values published on the bus. */
export type LifecycleEventType =
  | 'contract.created'
  | 'contract.ready'
  | 'contract.expiring'
  | 'contract.released'
  | 'contract.expired'

/**
 * Lifecycle bus message: `{type, contract_id, status}`.
 * Emitted for each contract state transition.
 */
export interface LifecycleEvent {
  type: LifecycleEventType
  contract_id: string
  status: ContractStatus
}
