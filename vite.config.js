import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  // GitHub Pages pubblica un repository come "project site", sotto
  // /<nome-repo>/ e non alla radice del dominio (a differenza di
  // <utente>.github.io, che sarebbe una "user site"). Solo la build di
  // produzione deve saperlo: il dev server locale resta alla radice, così
  // il flusso di sviluppo/test in sandbox non cambia.
  const base = command === 'build' ? '/manga-reader/' : '/';

  return {
    base,
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
        // 'prompt' (non 'autoUpdate'): quando c'è una nuova versione, il nuovo
        // service worker resta in attesa finché non è l'utente a confermare —
        // vedi UpdatePrompt.jsx — invece di ricaricare la pagina a sua insaputa.
        registerType: 'prompt',
        devOptions: {
          enabled: true,
        },
        includeAssets: [
          'favicon.ico',
          'favicon.svg',
          'apple-touch-icon-180x180.png',
        ],
        manifest: {
          name: 'Manga Reader',
          short_name: 'Manga Reader',
          description:
            'Lettore di manga CBZ/CBR offline, installabile su tablet.',
          lang: 'it',
          display: 'standalone',
          start_url: base,
          scope: base,
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
  };
});
