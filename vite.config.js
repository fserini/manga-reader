import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // host: true espone il dev server sulla rete locale (per provare sul tablet);
  // basicSsl serve l'app in HTTPS con un certificato self-signed, necessario
  // perché la File System Access API funziona solo in "secure context"
  // (localhost o https) — un IP di LAN in HTTP semplice non lo è.
  server: {
    host: true,
  },
  plugins: [
    react(),
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true,
      },
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Manga Reader',
        short_name: 'Manga Reader',
        description: 'Lettore di manga CBZ/CBR offline, installabile su tablet.',
        lang: 'it',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: '#121212',
        background_color: '#121212',
        icons: [
          {
            src: 'pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png',
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
