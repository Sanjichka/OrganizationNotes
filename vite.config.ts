import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Orgo',
        short_name: 'Orgo',
        description: 'Phone-only weekly task planner',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
      },
    }),
  ],
  server: {
    host: true, // expose on the LAN so you can open it on your phone
    allowedHosts: true, // accept tunnel hostnames (e.g. localtunnel) for phone testing
  },
  preview: {
    host: true,
    allowedHosts: true, // accept tunnel hostnames for the production preview
  },
})
