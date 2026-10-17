import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    fileParallelism: false, // Run SQLite tests sequentially to avoid test db collision
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
