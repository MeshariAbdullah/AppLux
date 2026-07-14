import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------
// Phase 6A release metadata — injected as a compile-time constant (see
// src/lib/releaseInfo.ts). Works with or without Vercel variables:
//   commit — VERCEL_GIT_COMMIT_SHA on Vercel, local git otherwise
//   env    — VERCEL_ENV normalized to production/preview, else local
// No secrets: the short SHA and env name are the only values shipped.
// ---------------------------------------------------------------------
const pkg = JSON.parse(readFileSync(path.resolve(root, 'package.json'), 'utf8')) as {
  version?: string;
};

function resolveCommit(): string {
  const vercelSha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (vercelSha) return vercelSha.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { cwd: root })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

const releaseDefine = {
  version: pkg.version ?? '0.0.0',
  commit: resolveCommit(),
  env:
    process.env.VERCEL_ENV === 'production'
      ? 'production'
      : process.env.VERCEL_ENV === 'preview'
        ? 'preview'
        : 'local',
  builtAt: new Date().toISOString(),
};

export default defineConfig({
  plugins: [react()],
  define: {
    __LEND_RELEASE__: JSON.stringify(releaseDefine),
  },
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
          // Shared app modules (i18n + locale JSONs, store, supabase
          // layer, ui components) are pinned to ONE always-loaded
          // chunk. Without this, Rollup folded them into
          // pages-customer-flows and the entry imported that chunk
          // statically — 359 KB of "lazy" pages silently loading at
          // boot. app-shared is a static dependency of the entry, so
          // boot cost is explicit, and the role chunks below contain
          // page code only.
          if (
            id.includes('/src/locales/') ||
            id.includes('/src/lib/') ||
            id.includes('/src/components/')
          ) {
            return 'app-shared';
          }
          // Phase 5B role groups — one lazy chunk per area instead of
          // 40+ micro-chunks. Only pages that routes.tsx loads via
          // lazyWithReload are listed; eager first-paint pages
          // (Welcome, AuthEntry, Login, Register, Home) stay in the
          // entry chunk.
          if (id.includes('/src/pages/admin/')) return 'pages-admin';
          if (id.includes('/src/pages/merchant/')) return 'pages-merchant';
          const customerFlowPages = [
            '/src/pages/Eligibility.tsx',
            '/src/pages/Stores.tsx',
            '/src/pages/StoreDetails.tsx',
            '/src/pages/Contracts.tsx',
            '/src/pages/Notifications.tsx',
            '/src/pages/Profile.tsx',
            '/src/pages/Scan.tsx',
            '/src/pages/Review.tsx',
            '/src/pages/Approval.tsx',
            '/src/pages/Tracking.tsx',
            '/src/pages/InvoiceTracking.tsx',
            '/src/pages/ContractTracking.tsx',
            '/src/pages/NoteTracking.tsx',
            '/src/pages/auth/Nafath.tsx',
            '/src/pages/auth/RegisterSuccess.tsx',
            '/src/pages/auth/ForgotPassword.tsx',
            '/src/pages/auth/ResetPassword.tsx',
          ];
          if (customerFlowPages.some((p) => id.includes(p))) {
            return 'pages-customer-flows';
          }
          return undefined;
        },
      },
    },
  },
});
