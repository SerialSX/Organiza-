import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // e2e/ é do Playwright (npm run test:e2e), não do Vitest
  test: { exclude: [...configDefaults.exclude, 'e2e/**'] },
})
