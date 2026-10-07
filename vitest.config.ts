import { defineConfig } from 'vitest/config'

// Terpisah dari vite.config.ts (root: 'web') agar test tetap dicari dari akar repo.
export default defineConfig({
  define: { __APP_VERSION__: '"test"', __BUILD_DATE__: '"test"' },
  test: { include: ['src/**/*.test.ts'] },
})
