import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const base = process.env.VITE_BASE || '/'

const icons = [
  { src: 'pwa-180.png', sizes: '180x180', type: 'image/png' },
  { src: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
  { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  {
    src: 'pwa-512-maskable.png',
    sizes: '512x512',
    type: 'image/png',
    purpose: 'maskable',
  },
] as const

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: [
        'favicon.svg',
        'apple-touch-icon.png',
        'pwa-180.png',
        'pwa-192.png',
        'pwa-512.png',
        'pwa-512-maskable.png',
      ],
      manifest: {
        id: base,
        name: '减脂笔记',
        short_name: '减脂笔记',
        description: '个人减脂追踪：空腹体重、肚脐腰围、饮食热量与热缺',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        lang: 'zh-CN',
        dir: 'ltr',
        theme_color: '#1B4F72',
        background_color: '#F4F1EA',
        categories: ['health', 'fitness'],
        icons: [...icons],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,json,woff,woff2}'],
        navigateFallback: `${base.replace(/\/$/, '')}/index.html`,
        navigateFallbackDenylist: [/^\/api/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ request, sameOrigin }) =>
              sameOrigin && request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'jianzhi-pages',
              networkTimeoutSeconds: 4,
              expiration: {
                maxEntries: 16,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
            },
          },
          {
            urlPattern: ({ request, sameOrigin }) =>
              sameOrigin &&
              ['image', 'font'].includes(request.destination),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'jianzhi-static',
              expiration: {
                maxEntries: 40,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 45321,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 45321,
    strictPort: true,
    allowedHosts: true,
  },
})
