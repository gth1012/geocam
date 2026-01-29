import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  base: '/geocam/',
  server: {
    host: true,
    allowedHosts: ['midlands-bet-harbour-decent.trycloudflare.com']
  }
})
