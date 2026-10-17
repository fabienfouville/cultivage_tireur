import { defineConfig } from 'vitest/config'

// Tests des règles Firestore : lancés via `npm run test:rules`, qui démarre l'émulateur
export default defineConfig({
  test: { include: ['tests/rules.test.ts'] },
})
