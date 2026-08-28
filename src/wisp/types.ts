// TypeScript types for the wisp broker API. These mirror docs/WISP_API.md.

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

/**
 * Container OS mode advertised by `GET /images` as `os`. Determines which
 * base image is `default` and which allow-listed images can actually boot.
 */
export type WispContainerOs = 'linux' | 'windows'

/**
 * Isolation level for a contract's container. `shared` uses the host
 * kernel/OCI runtime; `sandboxed` runs under gVisor (`runsc`); `vm` runs
 * inside a lightweight VM (Kata on Linux, Hyper-V on Windows). `confidential`
 * is reserved by wisp and rejected today.
 */
export type WispIsolation = 'shared' | 'sandboxed' | 'vm'

/**
 * Optional per-contract resource caps sent on `POST /contracts`. `cpus`,
 * `memory_mb`, and `pids` are **clamped down** to the matching non-zero limit
 * from `GET /images`. `gpus` is a **count** of whole, exclusively assigned
 * GPUs (default `0`); wisp **rejects, never clamps** it (`400` when the host
 * has no GPU support, when the count exceeds `gpu.max_gpus`, or when GPU
 * attach is unavailable at the resolved isolation; `409` when every device is
 * held by another live lease).
 */
export interface ContractResources {
  cpus?: number
  memory_mb?: number
  pids?: number
  gpus?: number
}

/**
 * Body for `POST /contracts` (app token). `ttl_seconds` is required; every
 * other field is optional. See docs/WISP_API.md for validation:
 *
 * - `image` must be one of `GET /images` `images` (defaults to `default`).
 * - `network` must be one of `limits.networks` (defaults to `open` when
 *   allowed, else the first configured network).
 * - `isolation` must be one of `isolation.supported` (defaults to
 *   `isolation.default`).
 * - `resources` is clamped or rejected as described on `ContractResources`.
 * - `userdata` is a script string run in the container during provisioning.
 * - `env` is a `KEY -> VALUE` map injected as the container environment
 *   (at most 128 entries, 256 KiB total; keys must be non-empty and free of
 *   `=`). Write-only: never echoed on status reads.
 * - `external_id` is an opaque caller-supplied identifier (max 128 bytes),
 *   echoed on `GET /contracts` and `GET /contracts/:id`.
 * - `meta` is an opaque object echoed on status reads.
 */
export interface CreateContractRequest {
  ttl_seconds: number
  image?: string
  network?: WispNetwork
  isolation?: WispIsolation
  resources?: ContractResources
  userdata?: string
  env?: Record<string, string>
  external_id?: string
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
 * Effective isolation posture returned by `GET /images` as `isolation`.
 * `supported` is the operator allow-list intersected with what the daemon can
 * actually run; `default` is applied when a create omits `isolation`. A
 * consumer should only offer the `supported` levels.
 */
export interface WispIsolationCapability {
  supported: WispIsolation[]
  default: WispIsolation
}

/**
 * A single GPU device the host advertises in `GET /images` `gpu.devices`.
 * `vram_mb` is the device's video memory in mebibytes; `class` is a
 * normalized lowercase-hyphenated product name (e.g. `nvidia-a100`).
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
 * `isolations` lists the isolation levels under which a GPU can be attached
 * (a subset of `isolation.supported`; at most `["shared"]` in wisp v1).
 */
export interface GpuCapability {
  supported: boolean
  devices: GpuDevice[]
  max_gpus: number
  isolations: WispIsolation[]
}

/**
 * Host aggregate capacity block returned by `GET /images` as `capacity`.
 * `max_contracts`, `total_cpus`, and `total_memory_mb` are operator budgets
 * (`0` means unlimited); `active_contracts`, `used_cpus`, and
 * `used_memory_mb` are the live totals reserved by non-terminal contracts.
 * A create that would exceed a budget fails with `409`.
 */
export interface HostCapacity {
  max_contracts: number
  active_contracts: number
  total_cpus: number
  used_cpus: number
  total_memory_mb: number
  used_memory_mb: number
}

/**
 * Response from `GET /images` (unauthenticated). Advertises the container OS,
 * image allow-list, default image, operator limits, effective isolation
 * posture, host GPU capability, and aggregate capacity. `gpu` is optional and
 * absent on older wisp; every other field is always present.
 */
export interface ImagesResponse {
  os: WispContainerOs
  images: string[]
  default: string
  limits: WispLimits
  isolation: WispIsolationCapability
  gpu?: GpuCapability
  capacity: HostCapacity
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
   * GPU device ids assigned to this contract, cross-referable to `GET /images`
   * `gpu.devices`. **Absent** when none are assigned or on older wisp. A
   * restart-reconciled lease may reference a device id the live inventory no
   * longer advertises.
   */
  gpus?: string[]
  /** Echoed opaque object from the create request; present only when set. */
  meta?: Record<string, unknown>
  /**
   * Echoed opaque caller-supplied identifier from the create request. Always
   * present on the status response (empty string when the create omitted it).
   */
  external_id?: string
}

/**
 * One entry in the `GET /contracts` list response. Notably the id field is
 * `id` here rather than `contract_id`; `expires_at` is Unix seconds and
 * `reserved_cpus` / `reserved_memory_mb` are the post-clamp amounts reserved
 * against the host capacity budget. `status` here is always one of
 * `provisioning`, `ready`, or `expiring` (wisp excludes terminal contracts
 * and the transient `requested` state from this list).
 */
export interface ContractListEntry {
  id: string
  external_id: string
  token: string
  status: Extract<ContractStatus, 'provisioning' | 'ready' | 'expiring'>
  expires_at: number
  ttl_seconds_remaining: number
  reserved_cpus: number
  reserved_memory_mb: number
  gpus: string[]
}

/**
 * Response from `GET /contracts` (app token). `contracts` is always present
 * (empty when nothing is live). Used by a restarted local agent to rebuild
 * its lease map; the dashboard does not call this today.
 */
export interface ListContractsResponse {
  contracts: ContractListEntry[]
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
