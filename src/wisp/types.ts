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

/** Network mode for a contract's container, from wisp's `limits.networks`. */
export type WispNetwork = 'none' | 'open' | 'egress'

/** Optional per-contract resource caps sent on `POST /contracts`. */
export interface ContractResources {
  cpus?: number
  memory_mb?: number
  pids?: number
}

/**
 * Body for `POST /contracts` (app token). `ttl_seconds` is required; `image`,
 * `network`, `resources`, `userdata`, `meta` are optional. `image` must be one
 * of the allow-listed images from `GET /images` (defaults to the discovery
 * `default`); `network` must be one of `limits.networks` (defaults to `open`).
 */
export interface CreateContractRequest {
  ttl_seconds: number
  image?: string
  network?: WispNetwork
  resources?: ContractResources
  userdata?: string
  meta?: Record<string, unknown>
}

/**
 * Operator-configured limits returned by `GET /images`. A `0` value means NO
 * cap for that dimension. `networks` lists the allowed network modes.
 */
export interface WispLimits {
  max_ttl_seconds: number
  max_cpus: number
  max_memory_mb: number
  pids_limit: number
  networks: WispNetwork[]
}

/**
 * A single GPU device the host advertises in `GET /images` `gpu.devices`.
 * `vram_mb` is the device's video memory in mebibytes; `class` is a
 * human-readable model/class (e.g. `"NVIDIA A100"`).
 */
export interface GpuDevice {
  id: string
  class: string
  vram_mb: number
}

/**
 * Host GPU capability — the top-level `gpu` object on `GET /images`. **Absent
 * on older wisp**, in which case the dashboard treats the host as having no GPU
 * support (render nothing). When `supported` is false the host offers no GPUs
 * and `devices` is empty. `max_gpus` is the per-contract device cap and
 * `isolations` lists the isolation levels under which a GPU can be attached.
 */
export interface GpuCapability {
  supported: boolean
  devices: GpuDevice[]
  max_gpus: number
  isolations: string[]
}

/**
 * Response from `GET /images` (unauthenticated). Advertises the image
 * allow-list, the default image, and the operator limits used to bound a
 * create request. `gpu` is the host GPU capability; it is **optional** and
 * absent on older wisp.
 */
export interface ImagesResponse {
  images: string[]
  default: string
  limits: WispLimits
  gpu?: GpuCapability
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
  /**
   * The specific GPU device ids assigned to this contract, cross-referable to
   * `GET /images` `gpu.devices`. **Absent/empty** when none are assigned or on
   * older wisp. A restart-reconciled lease may reference a device id the live
   * inventory no longer lists.
   */
  gpus?: string[]
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
