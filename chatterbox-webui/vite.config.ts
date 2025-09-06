import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    cors: true,
    allowedHosts: ['chatter.skinnyc.pro', 'localhost', 'fred', 'fred.taile5e8a3.ts.net'],
    hmr: {
      clientPort: 5173,
      host: 'localhost',
      protocol: 'ws',
    },
  },
})
