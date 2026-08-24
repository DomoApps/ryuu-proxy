import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['integration/tests/**/*.test.ts'],
    setupFiles: ['./integration/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    reporters: ['verbose'],
    globals: true,
  },
});
