import { defineConfig } from 'vitest/config'

// Vitest is used by the repo's `npm test` script. Tests live alongside the
// code they cover in `src/**/*.test.ts`. Node environment is sufficient for
// the client tests (they mock `fetch`); no DOM is needed.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    globals: false,
  },
})
