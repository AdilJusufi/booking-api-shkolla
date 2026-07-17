import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// FE-ja niset në http://localhost:5173 (i lejuar tashmë në CORS të backend-it).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
  },
})
