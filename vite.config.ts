import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// The dashboard always calls same-origin paths under the `/wisp` prefix. In dev,
// Vite proxies those to a real wisp instance (stripping the prefix) so the browser
// never issues cross-origin requests and we avoid CORS entirely. WebSocket
// endpoints (the shell PTY and the events stream) are proxied too via `ws: true`.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_WISP_TARGET || 'http://127.0.0.1:8080'

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/wisp': {
          target,
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/wisp/, ''),
        },
      },
    },
  }
})
