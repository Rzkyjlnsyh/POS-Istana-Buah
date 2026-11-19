/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      react(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'prompt',
        injectRegister: false,
        manifest: false,
        includeAssets: [
          'manifest.json',
          'icons/icon-192.png',
          'icons/icon-512.png',
          'icons/icon-maskable-512.png',
          'icons/icon.svg',
        ],
        devOptions: {
          enabled: false,
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        },
      }),
    ],
    server: {
      port: Number(env.VITE_DEV_PORT) || 5173,
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router'],
            'vendor-query': ['@tanstack/react-query', 'axios', 'zustand', 'zod'],
            'vendor-db': ['dexie'],
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
        exclude: ['src/main.tsx', 'src/sw.ts', 'src/vite-env.d.ts', 'src/**/*.test.{ts,tsx}'],
        thresholds: { lines: 70, functions: 70, branches: 70, statements: 70 },
      },
    },
  };
});
