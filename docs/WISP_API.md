# Wisp API Reference

This document is the API contract that **wisp-dashboard** builds against. Wisp is
a broker daemon that leases short-lived, root-access Docker containers
("contracts") over an HTTP + WebSocket API. The wisp source lives elsewhere; this
file is the canonical reference for later dashboard tasks.

All paths below are relative to the wisp base URL. **In the app, every wisp call
goes through the same-origin `/wisp` dev proxy** (configured in
`vite.config.ts`), which strips the `/wisp` prefix and forwards to the real wisp
instance — HTTP and WebSocket alike. So `GET /healthz` is reached in-app as
`GET /wisp/healthz`. This avoids browser CORS entirely.

## Authentication

Wisp uses two kinds of bearer tokens.

### App token

Sent as `Authorization: Bearer <app-token>`. Required for:

- `POST /contracts`
- `POST /events`
- the events WebSocket `GET /events` — which **also** accepts the token as a
  `?token=<app-token>` query parameter (useful because browsers cannot set
  arbitrary headers on a WebSocket handshake).

If wisp has no app token configured the gate is open (requests succeed without
one). The dashboard should nonetheless send the app token whenever the user has
configured one.

### Per-contract token

Returned in the `POST /contracts` response (`token`). Scoped to that one
contract. Required for:

- `POST /contracts/:id/exec` — as `Authorization: Bearer <contract-token>`.
- the shell WebSocket handshake — as `?token=<contract-token>` query param, **or**
  as a `bearer.<contract-token>` WebSocket subprotocol.

## Endpoints

### `GET /healthz`

Unauthenticated liveness check.

Response:

```json
{ "status": "ok" }
```

### `POST /contracts`

Requires the **app token**. Creates and provisions a new contract (container).

Request body (`preset`, `userdata`, `meta` are optional):

```json
{
  "ttl_seconds": 3600,
  "preset": "default",
  "userdata": "arbitrary string",
  "meta": { "any": "object" }
}
```

Response `201`:

```json
{
  "contract_id": "abc123",
  "token": "<per-contract-token>",
  "status": "requested"
}
```

### `GET /contracts/:id`

Fetch a contract's current status.

Response:

```json
{
  "contract_id": "abc123",
  "status": "ready",
  "ttl_seconds_remaining": 3540
}
```

### `DELETE /contracts/:id`

Releases and destroys the container. Returns the **same shape** as `GET`. Safe to
retry (idempotent).

```json
{
  "contract_id": "abc123",
  "status": "released",
  "ttl_seconds_remaining": 0
}
```

### `POST /contracts/:id/exec`

Requires the **per-contract token**. Runs a command in the contract's container.

Request body:

```json
{ "command": "ls -la /" }
```

Response:

```json
{ "stdout": "...", "stderr": "...", "exit_code": 0 }
```

> **Each exec is a fresh process** — there is no shared cwd or env between calls.
> To keep state within a single call, use a compound command, e.g.
> `cd /repo && git diff`.

### `POST /contracts/:id/exec?stream=1`

Requires the **per-contract token**. Same as above but streams output as
[Server-Sent Events](https://developer.mozilla.org/docs/Web/API/Server-sent_events).

- `event: chunk` — one per output chunk:

  ```
  event: chunk
  data: {"stream":"stdout","data":"partial output"}
  ```

  `stream` is `"stdout"` or `"stderr"`.

- `event: exit` — terminal event when the process finishes:

  ```
  event: exit
  data: {"exit_code":0}
  ```

- `event: error` — a failure mid-stream (instead of a normal exit):

  ```
  event: error
  data: {"error":"message"}
  ```

### `WS /contracts/:id/shell`

Requires the **per-contract token** (via `?token=` or the
`bearer.<contract-token>` subprotocol). Opens an interactive PTY as a single
**raw duplex byte stream**:

- Bytes the **server** sends are terminal output to render.
- Bytes the **client** sends are keystrokes forwarded to the shell's stdin.

There is **no** stdout/stderr multiplexing here — it is a TTY, so everything is
one interleaved stream.

### `POST /events`

Requires the **app token**. Publishes an event onto the wisp bus.

Request body:

```json
{ "type": "some.event", "data": { "any": "object" } }
```

Response: `202`.

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
requested -> provisioning -> ready -> expiring -> released | expired
```

- `requested` — accepted, not yet provisioned.
- `provisioning` — container is being created.
- `ready` — leased and usable (exec / shell available).
- `expiring` — nearing TTL; still usable briefly.
- `released` — explicitly released via `DELETE` (or lease returned).
- `expired` — TTL elapsed and the container was reclaimed.

### Lifecycle bus events

Wisp publishes a lifecycle event on the bus for each transition. Each carries
`{ "contract_id": string, "status": string }` in its `data`:

| Event                | Emitted when the contract becomes |
| -------------------- | --------------------------------- |
| `contract.created`   | `requested`                       |
| `contract.ready`     | `ready`                           |
| `contract.expiring`  | `expiring`                        |
| `contract.released`  | `released`                        |
| `contract.expired`   | `expired`                         |
