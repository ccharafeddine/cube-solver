import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import { applySiteUrl } from './src/build/siteMeta';

// Absolute link-preview URLs only when SITE_URL is set at build time (see src/build/siteMeta.ts).
const siteUrl = { name: 'site-url', transformIndexHtml: (html: string) => applySiteUrl(html, process.env.SITE_URL) };

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths so the same build works on a static host, as an
  // installed PWA, and inside the Tauri webview.
  plugins: [siteUrl],
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // Tauri expects a fixed dev port and must not have the screen cleared.
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  worker: { format: 'es' },
  // three.js alone is ~500 kB; one chunk is fine for a desktop-class app.
  build: { chunkSizeWarningLimit: 800 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The 3x3 tests build full pruning tables once per file.
    testTimeout: 120_000,
  },
});
