import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Firebase pèse ~250 Ko gzippés : c'est attendu
    chunkSizeWarningLimit: 1200,
  },
})
