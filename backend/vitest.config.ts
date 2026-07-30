import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      SUPABASE_URL: 'https://placeholder.supabase.co',
    },
  },
});
