import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
    },
  },
  server: {
    host: true,
    port: 5000,
    allowedHosts: true,
  },
  build: {
    // Phase 5A/5B chunking. Vendor chunks change only on dependency
    // bumps, so they stay long-lived in HTTP caches on the web build
    // (Capacitor ships all chunks locally either way — there the win
    // is smaller main-thread parse/eval per route).
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/react-router') ||
              id.includes('/scheduler/')
            ) {
              return 'vendor-react';
            }
            if (id.includes('@supabase')) return 'vendor-supabase';
            return undefined; // other tiny deps ride with their importer
          }
          return undefined;
        },
      },
    },
  },
});
