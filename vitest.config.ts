import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    // Sem setupFiles — tests/setup.ts é uma factory importada diretamente por cada teste
  },
  resolve: {
    alias: { '@shared': path.resolve(__dirname, 'src/shared') },
  },
})
