import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  },
  build: {
    // Output to /heatloss/public — one level up from /heatloss/client.
    // Express in server/server.js serves from path.join(__dirname, '..', 'public')
    // which resolves to the same location. These must stay in sync.
    outDir: '../public',
    emptyOutDir: true,
  }
})
