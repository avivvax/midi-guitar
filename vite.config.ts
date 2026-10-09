import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Production builds are served from the GitHub Pages project sub-path
// (https://avivvax.github.io/midi-guitar/). Override with `--base /` for root
// hosting such as Firebase (see the build:firebase script).
const PAGES_BASE = '/midi-guitar/';

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? PAGES_BASE : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'MIDI Guitar',
        short_name: 'Guitar',
        description: 'DIY 6-string MIDI guitar – play in the browser',
        lang: 'he',
        dir: 'rtl',
        theme_color: '#0f1115',
        background_color: '#0f1115',
        display: 'standalone',
        orientation: 'any',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // The Chordonomicon index (cx/) is never precached; shards are cached as they are used.
        globIgnores: ['cx/**'],
        navigateFallbackDenylist: [/\/cx\//],
        runtimeCaching: [
          {
            // Manifest changes on every index build: prefer the network, fall back offline.
            urlPattern: ({ url }) => url.pathname.endsWith('/cx/manifest.json'),
            handler: 'NetworkFirst',
            options: { cacheName: 'cx-manifest', networkTimeoutSeconds: 4 },
          },
          {
            // Shard URLs carry ?v=<build>, so cache-first is safe across rebuilds.
            urlPattern: ({ url }) => url.pathname.includes('/cx/') && !url.pathname.endsWith('manifest.json'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'cx-shards',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
}));
