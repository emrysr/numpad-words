import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Numpad Words',
        short_name: 'Numpad Words',
        description: 'Predictive T9-style text entry for numeric keypads',
        theme_color: '#1a1a1a',
        background_color: '#1a1a1a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Workbox's default glob only covers js/css/html/ico/png/svg - the
        // app can't function offline without trie.json, so it (and the jpg
        // favicon) need to be pulled in explicitly.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,json,webmanifest}'],
        // trie.json is a multi-MB static data file (grows as it gains more
        // per-node metadata) - the default 2MB precache limit would
        // otherwise silently skip it, breaking offline use.
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
      },
    }),
  ],
})
