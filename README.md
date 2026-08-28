# wisp-dashboard

A standalone **React + Vite + TypeScript** browser dashboard and console for the
**Wisp** broker, the daemon that leases short-lived, root-access throwaway
Docker containers ("contracts") over an HTTP + WebSocket API. This app runs in a
browser alongside a running wisp instance and talks to it over wisp's API.

The UI is built with **Material UI (MUI)** + Emotion and the dark theme in
[`src/theme.ts`](src/theme.ts), applied app-wide via `ThemeProvider` +
`CssBaseline`. New components should use MUI components and the `sx` prop for
styling rather than ad-hoc CSS files.

It is a separate client app: the wisp source is not in this repo. The full API
contract the dashboard builds against is captured in
[`docs/WISP_API.md`](docs/WISP_API.md).

What the dashboard does today:

- Live health indicator in the header (polls `GET /wisp/healthz` every 3 s).
- Create a lease (image, network, TTL, cpus / memory / pids, userdata), driven
  by the allow-list and limits from `GET /images`.
- Lease list and per-lease detail with an Overview (status, countdown, assigned
  GPUs, host GPU capability, lifecycle event feed), an interactive Console
  (xterm.js over the shell WebSocket), and an Exec panel (buffered or streamed
  command output).
- Release a lease.

The typed wisp client and `useWispClient` hook cover every wisp endpoint,
including `GET /contracts` (typed as `ListContractsResponse`) and the
`isolation`, `resources.gpus`, `env`, `external_id`, and `meta` create fields;
the `GET /images` response is typed all the way down to its `os`, `isolation`,
and `capacity` blocks. The dashboard UI does not surface every one of those
yet: the create form is still just image / network / TTL / cpus / memory /
pids / userdata, the list endpoint is unused (the dashboard tracks its own
leases in `localStorage`), and `os` / `capacity` are not read in any panel.

## Getting started

```bash
npm install
npm run dev
```

`npm run dev` starts the Vite dev server (default http://localhost:5173).

To type-check and produce a production build:

```bash
npm run build
```

`npm run preview` serves that build locally. Unit tests live alongside the
code they cover (e.g. `src/wisp/client.test.ts`) and run under Vitest:

```bash
npm test          # single run
npm run test:watch  # watch mode
```

`npm run build` (which runs `tsc -b`) is the type-check gate. There is no
linter script.

Note that the `/wisp` proxy below is a **dev-server** feature: `vite preview`
and a static deployment of `dist/` do not proxy, so the app only talks to wisp
through `npm run dev` unless you put an equivalent `/wisp` reverse proxy in
front of it.

## Pointing at a wisp instance

The dashboard never calls wisp directly. Instead it always requests same-origin
paths under the `/wisp` prefix (e.g. `/wisp/healthz`), and the Vite dev server
**proxies** those to a real wisp instance, stripping the `/wisp` prefix and
forwarding both HTTP and WebSocket traffic. This is how we avoid browser CORS
against wisp.

Configure the proxy target with the `VITE_WISP_TARGET` env var (the only env
var the app reads). Copy the example file and edit it:

```bash
cp .env.example .env
# then set, e.g.:
# VITE_WISP_TARGET=http://127.0.0.1:8099
```

- Defaults to `http://127.0.0.1:8080` when unset, which is wisp's own default
  listen address (`WISP_ADDR`).
- If your wisp listens elsewhere (for example `WISP_ADDR=127.0.0.1:8099`),
  point the target at that host and port.

Or set it inline for a single run:

```bash
VITE_WISP_TARGET=http://127.0.0.1:8099 npm run dev
```

Once wisp is running and reachable at that target, the **health indicator** in
the header polls `GET /wisp/healthz` every few seconds and shows connected vs
disconnected, proving the proxy works end to end.

## Settings and tokens

Wisp can be configured with an **app token** that gates contract creation, the
contract list, and the event bus (see the Authentication section of
[`docs/WISP_API.md`](docs/WISP_API.md)). The gear icon in the header opens the
Settings dialog where you paste that token. It is stored in the browser's
`localStorage` under the key `wisp.appToken` (never sent anywhere except to
wisp through the proxy) and is applied automatically to `POST /contracts`,
`POST /events`, and the `WS /events` handshake. Clearing it removes the key.
If wisp has no app token configured, leave it empty.

`GET /contracts/:id` and `DELETE /contracts/:id` accept **either** the app
token or the contract's own token; the dashboard sends the app token when the
Settings dialog has one and falls back to the per-contract token otherwise.
That is what keeps the 4 s status poll and the Release action from `401`ing
when wisp has an app token configured. If the poll does fail, the failing
status code and message are surfaced on the lease list card and on the lease
Overview instead of being silently swallowed.

Per-contract tokens are returned once, when a lease is created. The dashboard
keeps them, together with the rest of its tracked leases, in `localStorage`
under `wisp.contracts` so they survive a page refresh; it does not use wisp's
`GET /contracts` list. Removing a lease from the list forgets its token.

## Project layout

```
docs/WISP_API.md                    full wisp API contract (auth, endpoints, lifecycle)
src/wisp/types.ts                   TypeScript types for the wisp API
src/wisp/client.ts                  typed HTTP client + WebSocket/SSE URL builders
src/theme.ts                        MUI dark theme (ThemeProvider + CssBaseline in main.tsx)
src/main.tsx                        providers: theme, SettingsProvider, ContractsProvider
src/App.tsx                         app shell (AppBar, health, New Lease, Settings, list/detail)
src/hooks/useHealth.ts              polls /wisp/healthz
src/hooks/useSettings.tsx           app-token context, persisted to localStorage
src/hooks/useWispClient.ts          client bound to the current app token
src/hooks/useContracts.tsx          tracked leases (localStorage) + status poll loop
src/hooks/useEventStream.ts         WS /events with reconnect
src/hooks/useExecStream.ts          streaming exec (SSE over fetch)
src/hooks/useGpuCapability.ts       host gpu block from GET /images
src/hooks/useCountdown.ts           per-second TTL countdown / elapsed timers
src/components/HealthIndicator.tsx  header connected / disconnected chip
src/components/SettingsPanel.tsx    app-token dialog
src/components/CreateLeaseDialog.tsx  New Lease form driven by GET /images
src/components/ContractList.tsx     lease list
src/components/ContractDetail.tsx   lease header + Overview / Console / Exec tabs
src/components/LeaseOverview.tsx    status, TTL, GPUs, lifecycle feed
src/components/LifecycleFeed.tsx    per-lease lifecycle events from WS /events
src/components/ConsolePanel.tsx     xterm.js shell over WS /contracts/:id/shell
src/components/ExecPanel.tsx        sync + streaming exec
src/components/GpuCapabilitySection.tsx  host GPU inventory
src/components/AssignedGpus.tsx     a lease's assigned device ids
vite.config.ts                      the /wisp -> VITE_WISP_TARGET dev proxy
```
