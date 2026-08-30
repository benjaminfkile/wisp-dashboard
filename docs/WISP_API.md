# Wisp API Reference

This document is the API contract that **wisp-dashboard** builds against. Wisp is
a broker daemon that leases short-lived, root-access Docker containers
("contracts") over an HTTP + WebSocket API. The wisp source lives elsewhere; this
file is the reference for the dashboard and is kept in sync with wisp's actual
handlers (`internal/server/*.go` in the wisp repo). Where the dashboard does not
yet use an endpoint or field, that is called out.

All paths below are relative to the wisp base URL. **In the app, every wisp call
goes through the same-origin `/wisp` dev proxy** (configured in
`vite.config.ts`), which strips the `/wisp` prefix and forwards to the real wisp
instance, HTTP and WebSocket alike. So `GET /healthz` is reached in-app as
`GET /wisp/healthz`. This avoids browser CORS entirely.

Every error response is JSON shaped `{ "error": "<message>" }` with the failing
HTTP status.

## Authentication

Wisp uses two kinds of bearer tokens.

### App token

Sent as `Authorization: Bearer <app-token>`. Required for:

- `POST /contracts`
- `GET /contracts` (the list)
- `POST /events`
- the events WebSocket `GET /events`, which **also** accepts the token as a
  `?token=<app-token>` query parameter (useful because browsers cannot set
  arbitrary headers on a WebSocket handshake).

It is also **one of two** accepted credentials for `GET /contracts/:id` and
`DELETE /contracts/:id` (see "Per-contract token" below).

If wisp has no app token configured the gate is open (requests succeed without
one). The dashboard should nonetheless send the app token whenever the user has
configured one. A missing or wrong token is a `401`.

### Per-contract token

Returned in the `POST /contracts` response (`token`) and on `GET /contracts`.
Scoped to that one contract. Required for:

- `POST /contracts/:id/exec`, as `Authorization: Bearer <contract-token>`.
- the shell WebSocket handshake, as `?token=<contract-token>` query param, **or**
  as a `bearer.<contract-token>` WebSocket subprotocol.

`GET /contracts/:id` and `DELETE /contracts/:id` accept **either** the app token
or that contract's own token in the `Authorization: Bearer` header. When wisp
has an app token configured and the request carries neither, they return
`401`; when no app token is configured they are open.

## Endpoints

### `GET /healthz`

Unauthenticated liveness check.

Response:

```json
{ "status": "ok" }
```

### `GET /images`

**Unauthenticated.** Advertises the host's container OS, the
operator-configured image allow-list, the default image, the limits that bound
a create request, the effective isolation posture, the GPU capability, and the
host's aggregate capacity. Wisp has no named presets; a create request instead
picks an image, network, isolation, and resources directly from what this
endpoint advertises.

Response:

```json
{
  "os": "linux",
  "images": ["ubuntu:24.04", "alpine:3.20"],
  "default": "ubuntu:24.04",
  "limits": {
    "max_ttl_seconds": 86400,
    "max_cpus": 4,
    "max_memory_mb": 8192,
    "pids_limit": 512,
    "networks": ["none", "open", "egress"]
  },
  "isolation": { "supported": ["shared", "sandboxed"], "default": "shared" },
  "gpu": {
    "supported": true,
    "devices": [
      { "id": "GPU-3a1f...", "class": "nvidia-a100", "vram_mb": 40960 },
      { "id": "GPU-9c2b...", "class": "nvidia-a100", "vram_mb": 40960 }
    ],
    "max_gpus": 2,
    "isolations": ["shared"]
  },
  "capacity": {
    "max_contracts": 8,
    "active_contracts": 2,
    "total_cpus": 16,
    "used_cpus": 4,
    "total_memory_mb": 32768,
    "used_memory_mb": 6144
  }
}
```

- `os` is the daemon's container OS mode, `"linux"` or `"windows"`. `default`
  is the OS-appropriate base image. The dashboard does not read `os` yet.
- A `0` value in any numeric limit means **NO cap** for that dimension.
- `networks` entries are drawn from `"none"`, `"open"`, and `"egress"`.
- `isolation.supported` is the host's **effective** isolation posture: the
  operator allow-list intersected with the levels the daemon can actually run
  (`shared` always; `sandboxed` when gVisor/`runsc` is registered; `vm` on a
  Kata-enabled Linux daemon or a Windows daemon via Hyper-V). `isolation.default`
  is applied when a create omits `isolation`. A consumer should only offer the
  `supported` levels.
- `gpu` is the host's **GPU capability**. Current wisp **always** sends it; the
  dashboard still treats an absent `gpu` (older wisp) exactly like no GPU
  support (render nothing, no error).
  - `gpu.supported`: whether the host can attach GPUs at all. When `false`,
    `devices` is `[]`, `max_gpus` is `0`, and a consumer should hide the GPU
    section.
  - `gpu.devices`: the inventory of attachable devices. Each is
    `{ "id": string, "class": string, "vram_mb": int }`, where `id` is the
    stable device identifier, `class` a normalized lowercase-hyphenated product
    name (e.g. `nvidia-geforce-rtx-4090`), and `vram_mb` the device video memory
    in mebibytes (render human-readably, e.g. `40960 -> 40 GB`).
  - `gpu.max_gpus`: the maximum number of devices a single contract may be
    assigned (the operator cap intersected with the detected device count).
  - `gpu.isolations`: the isolation levels under which a GPU can be attached (a
    subset of `isolation.supported`; at most `["shared"]` in wisp v1).
- `capacity` is the host's **aggregate** budget and live usage across all
  leases. It is always present. `max_contracts`, `total_cpus`, and
  `total_memory_mb` are operator budgets (`0` means unlimited);
  `active_contracts`, `used_cpus`, and `used_memory_mb` are the live totals
  reserved by non-terminal contracts. When a create would exceed a budget wisp
  answers `409` (see `POST /contracts`). The dashboard does not read
  `capacity` yet.

### `POST /contracts`

Requires the **app token**. Creates and provisions a new contract (container).
The call is **synchronous**: wisp boots the container, runs `userdata`, and only
then responds, so a successful response already reports the final state.

On the success path wisp emits a single structured `contract provisioned` log
line with per-phase timings so an operator can pin a slow create to the phase
that stalled. Its fields are `contract_id`, `image`, `isolation`, `total_ms`,
`image_ms`, `create_ms`, `start_ms`, and `userdata_ms`; every duration is in
milliseconds and a phase that did not run (for example an empty `userdata`)
reports `0`. These are server-side log fields, not part of the HTTP response
body.

Request body. `ttl_seconds` is **required**; `image`, `network`, `isolation`,
`resources`, `userdata`, `env`, `external_id`, and `meta` are optional:

```json
{
  "ttl_seconds": 3600,
  "image": "ubuntu:24.04",
  "network": "open",
  "isolation": "shared",
  "resources": { "cpus": 2, "memory_mb": 2048, "pids": 256, "gpus": 0 },
  "userdata": "arbitrary string",
  "env": { "KEY": "value" },
  "external_id": "opaque-upstream-id",
  "meta": { "any": "object" }
}
```

- `ttl_seconds` must be positive (`400` otherwise) and is **clamped down** to
  `limits.max_ttl_seconds` when that limit is set.
- `image` must be one of the `images` from `GET /images` (`400` otherwise); it
  defaults to that endpoint's `default` when omitted. An allow-listed image
  whose OS does not match the host's container mode fails at boot with a `400`
  ("this host is in <os> container mode; the requested image is not
  compatible").
- `network` must be one of `limits.networks` (`400` otherwise); it defaults to
  `"open"` when allowed, else the first configured network.
- `isolation` must be one of `GET /images` `isolation.supported` (`400`
  otherwise); it defaults to `isolation.default` when omitted. Levels are
  ordered `shared` < `sandboxed` < `vm` (`confidential` is reserved and
  rejected). The dashboard does not send `isolation` yet.
- `resources.cpus`, `resources.memory_mb`, and `resources.pids` are each
  optional and are **clamped down** to the matching non-zero limit from
  `GET /images` (never rejected). An omitted dimension inherits the per-lease
  maximum when one is configured.
- `resources.gpus` is a **count** of whole, exclusively assigned GPUs (default
  `0`). Unlike the other dimensions it is **rejected, never clamped**: `400`
  when the host has no GPU support, when the count exceeds `gpu.max_gpus`, or
  when GPU attach is unavailable at the resolved isolation level; `409`
  ("no GPU devices currently available") when every advertised device is held
  by another live lease. The dashboard does not send `gpus` yet.
- `env` is an opaque `KEY -> VALUE` map injected as the container environment
  (at most 128 entries, 256 KiB total; keys must be non-empty and free of `=`).
  It is write-only: never echoed on status reads. The dashboard does not send
  `env` yet.
- `external_id` is an opaque caller-supplied identifier (max 128 bytes) echoed
  back on `GET /contracts` and `GET /contracts/:id`. The dashboard does not
  send it yet.
- `meta` is an opaque object echoed back on status reads.

Errors: `400` for any validation failure above, `401` for a missing/invalid app
token, `409` when the host's aggregate capacity budget (contracts, CPU, or
memory) is exhausted ("host at capacity: ..."), `500` when provisioning fails
(for example `userdata` exiting non-zero; the container is destroyed and the
contract ends up `expired`).

Response `201`:

```json
{
  "contract_id": "abc123",
  "token": "<per-contract-token>",
  "status": "ready"
}
```

`status` is the contract's state after provisioning, which is `ready` on the
success path.

### `GET /contracts`

Requires the **app token**. Lists every **non-terminal** contract together with
its current per-contract token, so a restarted local agent can rebuild its lease
map. Terminal contracts (`released`, `expired`), the transient `requested`
state, and the transient `releasing` fence are excluded, so `status` here is
always one of `provisioning`, `ready`, or `expiring`.

Response:

```json
{
  "contracts": [
    {
      "id": "abc123",
      "external_id": "",
      "token": "<per-contract-token>",
      "status": "ready",
      "expires_at": 1755370800,
      "ttl_seconds_remaining": 3540,
      "reserved_cpus": 2,
      "reserved_memory_mb": 2048,
      "gpus": []
    }
  ]
}
```

- Note the id field is `id` here, not `contract_id`.
- `expires_at` is Unix seconds; `reserved_cpus` / `reserved_memory_mb` are the
  post-clamp amounts reserved against the host capacity budget.
- `gpus` is always an array (empty for a GPU-less lease).
- `contracts` is always present (empty when nothing is live).

The dashboard does **not** call this endpoint: it tracks the contracts it
created itself in `localStorage` (see `src/hooks/useContracts.tsx`).

### `GET /contracts/:id`

Requires the **app token or that contract's token**. Fetches a contract's
current status.

Response:

```json
{
  "contract_id": "abc123",
  "status": "ready",
  "ttl_seconds_remaining": 3540,
  "gpus": ["GPU-3a1f..."],
  "meta": { "any": "object" },
  "external_id": ""
}
```

- `ttl_seconds_remaining` is clamped at `0` and is always `0` for a terminal
  contract.
- `gpus` is the list of GPU device ids assigned to this contract, each
  cross-referable to a `GET /images` `gpu.devices[].id`. It is **optional**:
  **absent** when no devices are assigned. A restart-reconciled lease may list a
  device id the live inventory no longer advertises; a consumer should render
  such an id as-is (bare, no class).
- `meta` is present only when the create supplied one; `external_id` is always
  present (empty string when none was supplied). The dashboard does not read
  either yet.
- `404` ("contract not found") for an unknown id. Wisp's reaper **deletes a
  terminal contract from memory one reaper tick after it became terminal**, so a
  poller sees the terminal status at most briefly and then `404`. The dashboard
  treats a `404` on a tracked contract as `expired`.

### `DELETE /contracts/:id`

Requires the **app token or that contract's token**. Releases and destroys the
container. Returns the **same shape** as `GET`. The handler first transitions
the contract to the transient, non-terminal `releasing` state to fence the
reaper off it, then kills the container, then completes the terminal transition
to `released`. It is **idempotent**: a `DELETE` against a contract that is
already `released` or `expired` returns `200` with the contract's current
terminal status (which may therefore be `expired` rather than `released`) and
frees nothing twice; a `DELETE` against a contract already in `releasing` (a
concurrent release is in flight) likewise returns `200` echoing the current
`releasing` status without a second container kill or a double free. An id the
reaper has already forgotten is a `404`.

```json
{
  "contract_id": "abc123",
  "status": "released",
  "ttl_seconds_remaining": 0,
  "external_id": ""
}
```

### `POST /contracts/:id/exec`

Requires the **per-contract token**. Runs a command in the contract's container.
The contract must be `ready` or `expiring`: any other state is a `409`
("contract not ready"), including the transient `releasing` fence a `DELETE`
installs before killing the container. Unknown id is `404`, missing/invalid
token is `401`, an empty or non-JSON body is `400`.

Request body:

```json
{ "command": "ls -la /" }
```

Response:

```json
{ "stdout": "...", "stderr": "...", "exit_code": 0 }
```

A non-zero `exit_code` is still a `200`.

> **Each exec is a fresh process**: there is no shared cwd or env between calls.
> The command runs through the container's shell (`/bin/sh -c` on Linux,
> `cmd /c` on a Windows host), so to keep state within a single call use a
> compound command, e.g. `cd /repo && git diff`.

### `POST /contracts/:id/exec?stream=1`

Requires the **per-contract token**. Same preconditions and body as above, but
streams output as
[Server-Sent Events](https://developer.mozilla.org/docs/Web/API/Server-sent_events)
(`Content-Type: text/event-stream`). The `200` is committed before the first
byte of output, so a failure mid-stream arrives as an `error` event, not a
status code.

- `event: chunk`, one per output chunk:

  ```
  event: chunk
  data: {"stream":"stdout","data":"partial output"}
  ```

  `stream` is `"stdout"` or `"stderr"`.

- `event: exit`, the terminal event when the process finishes:

  ```
  event: exit
  data: {"exit_code":0}
  ```

- `event: error`, a failure mid-stream (instead of a normal exit):

  ```
  event: error
  data: {"error":"message"}
  ```

The dashboard cannot use `EventSource` here (it cannot set the `Authorization`
header), so it POSTs with `fetch` and parses the SSE frames from the response
body (`src/hooks/useExecStream.ts`).

### `WS /contracts/:id/shell`

Requires the **per-contract token** (via `?token=` or the
`bearer.<contract-token>` subprotocol). The contract must be `ready` or
`expiring` (`409` otherwise, including the transient `releasing` fence; `404`
unknown, `401` bad token; all rejected before the upgrade). Opens an interactive
PTY as a single **raw duplex byte stream**:

- Bytes the **server** sends (binary frames) are terminal output to render.
- Bytes the **client** sends are keystrokes forwarded to the shell's stdin.
  Binary frames are forwarded verbatim; text frames are too, **unless** the
  text parses as the resize control frame
  `{"type":"resize","rows":<n>,"cols":<n>}`, which is applied to the TTY
  out of band and not written to stdin.

There is **no** stdout/stderr multiplexing here: it is a TTY, so everything is
one interleaved stream. The dashboard does not send resize frames yet.

### `POST /events`

Requires the **app token**. Publishes an event onto the wisp bus. Wisp does not
interpret `type` or `data`; `type` must be non-empty (`400` otherwise) and
`data` may be any JSON value or omitted.

Request body:

```json
{ "type": "some.event", "data": { "any": "object" } }
```

Response: `202` with `{ "status": "published" }`.

### `WS /events`

Requires the **app token** (via `Authorization` header or `?token=`). Optional
`?type=a,b,c` filter to subscribe only to those event types. Delivers live events
as JSON text messages, each shaped like:

```json
{ "type": "contract.ready", "data": { "contract_id": "abc123", "status": "ready" } }
```

## Contract lifecycle

States progress as:

```
requested -> provisioning -> ready -> expiring -> releasing -> released
```

with `expired` reachable from any active state.

- `requested`: accepted, not yet provisioned. Transient; a synchronous create
  passes through it before responding, so a client normally never observes it.
- `provisioning`: container is being created and `userdata` is running.
- `ready`: leased and usable (exec / shell available).
- `expiring`: a warning window a configurable lead time before the TTL. The
  container is still alive and **exec and shell remain accepted** in this
  state; it exists so a client can react to the `contract.expiring` bus event
  and wind work down before the TTL elapses.
- `releasing`: a transient, **non-terminal** fence a `DELETE` installs before
  killing the container so the reaper cannot expire (and then purge) the
  contract from under the release handler. Exec and shell are `409` in this
  state; `GET /contracts` excludes it; a concurrent `DELETE` returns `200`
  echoing `releasing` without a second container kill. The state normally
  exits to `released` once the handler finishes tearing the container down.
- `released`: explicitly released via `DELETE`.
- `expired`: the TTL elapsed, the backing container died out of band (docker
  kill / rm / OOM, detected by the reaper while `ready` or `expiring`), or
  provisioning failed. In every case the container is destroyed.

`released` and `expired` are terminal. A `DELETE` is legal from any
non-terminal state (including `requested` and `provisioning`).

### Lifecycle bus events

Wisp publishes a lifecycle event on the bus for each transition. Each carries
`{ "contract_id": string, "status": string }` in its `data`; `contract.expired`
additionally carries a `reason` string:

| Event                | Emitted when the contract becomes |
| -------------------- | --------------------------------- |
| `contract.created`   | `requested`                       |
| `contract.ready`     | `ready`                           |
| `contract.expiring`  | `expiring`                        |
| `contract.released`  | `released`                        |
| `contract.expired`   | `expired` (TTL elapsed, backing container died, or provisioning failed) |

Every `contract.expired` event carries a `reason` field on its `data`
distinguishing the three cases:

- `"ttl_expired"`: the reaper ended the lease because its TTL elapsed.
- `"container_died"`: the reaper detected the backing container died out of
  band (docker kill / rm / OOM) while the lease was `ready` or `expiring`.
- `"provisioning_failed"`: the synchronous `POST /contracts` failed during
  provisioning (for example `userdata` exiting non-zero); the container is
  destroyed and the contract ends up `expired`. The create call still returns
  its error response as the primary signal; the bus event lets a passive
  subscriber observe the same outcome.

Only `contract.expired` carries `reason`; the other lifecycle events are
unchanged.
