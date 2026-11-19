/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: Number(env.VITE_DEV_PORT) || 5173,
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router'],
            'vendor-query': ['@tanstack/react-query', 'axios', 'zustand', 'zod'],
            'vendor-ui': ['lucide-react'],
          },
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      testTimeout: 25000,
      setupFiles: ['./vitest.setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/main.tsx', 'src/vite-env.d.ts', 'src/**/*.test.{ts,tsx}'],
        thresholds: { lines: 70, functions: 70, branches: 70, statements: 70 },
      },
    },
  };
});
