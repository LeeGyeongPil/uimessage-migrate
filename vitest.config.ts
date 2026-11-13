import { defineConfig } from 'vitest/config';

// Generous timeouts: CI runners start CLI subprocesses and `npm pack` more slowly than a laptop.
export default defineConfig({
  test: { testTimeout: 60_000, hookTimeout: 60_000 },
});
