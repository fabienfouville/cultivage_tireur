import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Les tests des règles ont besoin de l'émulateur : ils se lancent avec `npm run test:rules`
    exclude: ['**/node_modules/**', 'tests/rules.test.ts'],
  },
})
