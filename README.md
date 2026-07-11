# wisp-dashboard

A standalone **React + Vite + TypeScript** browser dashboard and console for the
**Wisp** broker — the daemon that leases short-lived, root-access throwaway
Docker containers ("contracts") over an HTTP + WebSocket API. This app runs in a
browser alongside a running wisp instance and talks to it over wisp's API.

The UI is built with **Material UI (MUI)** + Emotion and the dark theme in
[`src/theme.ts`](src/theme.ts), applied app-wide via `ThemeProvider` +
`CssBaseline`. New components should use MUI components and the `sx` prop for
styling rather than ad-hoc CSS files.

It is a separate client app: the wisp source is not in this repo. The full API
contract the dashboard builds against is captured in
[`docs/WISP_API.md`](docs/WISP_API.md).

> Status: this is the foundational scaffold — app shell, dev proxy, shared API
> types, and a live health indicator. Lease management, the console, and exec
> panels come in later tasks.

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

## Pointing at a wisp instance

The dashboard never calls wisp directly. Instead it always requests same-origin
paths under the `/wisp` prefix (e.g. `/wisp/healthz`), and the Vite dev server
**proxies** those to a real wisp instance — stripping the `/wisp` prefix and
forwarding both HTTP and WebSocket traffic. This is how we avoid browser CORS
against wisp.

Configure the proxy target with the `VITE_WISP_TARGET` env var. Copy the example
file and edit it:

```bash
cp .env.example .env
# then set, e.g.:
# VITE_WISP_TARGET=http://127.0.0.1:8099
```

- Defaults to `http://127.0.0.1:8080` when unset.
- A common alternative wisp port is `http://127.0.0.1:8099`.

Or set it inline for a single run:

```bash
VITE_WISP_TARGET=http://127.0.0.1:8099 npm run dev
```

Once wisp is running and reachable at that target, the **health indicator** in
the header polls `GET /wisp/healthz` every few seconds and shows connected vs
disconnected — proving the proxy works end to end.

## Project layout

```
docs/WISP_API.md        full wisp API contract (auth, endpoints, lifecycle)
src/wisp/types.ts       TypeScript types for the wisp API
src/wisp/client.ts      typed HTTP/WebSocket client for the wisp API
src/theme.ts            MUI dark theme (ThemeProvider + CssBaseline in main.tsx)
src/App.tsx             app shell (MUI AppBar header + health indicator + placeholder)
src/hooks/useHealth.ts  polls /wisp/healthz
src/hooks/useSettings.tsx  app-token context, persisted to localStorage
vite.config.ts          the /wisp -> VITE_WISP_TARGET dev proxy
```
