import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Identifiant de la version mise en ligne : l'app le compare à /version.json pour proposer de recharger
const BUILD_ID = new Date().toISOString()

const versionFile = (): Plugin => ({
  name: 'version-file',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) })
  },
})

export default defineConfig({
  plugins: [react(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  build: {
    // Firebase pèse ~250 Ko gzippés : c'est attendu
    chunkSizeWarningLimit: 1200,
  },
})
