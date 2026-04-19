import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icons/*.png'],
      manifest: {
        name: 'fin.centro — Controle Financeiro',
        short_name: 'fin.centro',
        description: 'Dashboard financeiro pessoal com Open Finance',
        theme_color: '#FF6B00',
        background_color: '#0D0D1A',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ],
        categories: ['finance', 'productivity'],
        lang: 'pt-BR',
        shortcuts: [
          {
            name: 'Dashboard',
            url: '/?tab=dashboard',
            description: 'Ver resumo financeiro'
          },
          {
            name: 'Transações',
            url: '/?tab=transacoes',
            description: 'Ver transações'
          }
        ]
      },
      workbox: {
        // Cache de assets estáticos
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Cache de chamadas API com stale-while-revalidate
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            urlPattern: /^https:\/\/(sandbox|api)\.belvo\.com\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'belvo-api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 }, // 5 min
              networkTimeoutSeconds: 10
            }
          }
        ]
      }
    })
  ]
})
