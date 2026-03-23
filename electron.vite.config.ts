import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { config as loadEnv } from 'dotenv'
import { resolve } from 'path'

// Load .env.production for build-time injection
loadEnv({ path: resolve(__dirname, '.env.production'), override: false })

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { lib: { entry: 'src/main/index.ts' } },
    define: {
      'process.env.DATABASE_URL': JSON.stringify(process.env['DATABASE_URL'] ?? ''),
      "process.env['DATABASE_URL']": JSON.stringify(process.env['DATABASE_URL'] ?? ''),
      'process.env.SUPABASE_URL': JSON.stringify(process.env['SUPABASE_URL'] ?? ''),
      "process.env['SUPABASE_URL']": JSON.stringify(process.env['SUPABASE_URL'] ?? ''),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(process.env['SUPABASE_ANON_KEY'] ?? ''),
      "process.env['SUPABASE_ANON_KEY']": JSON.stringify(process.env['SUPABASE_ANON_KEY'] ?? ''),
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { lib: { entry: 'src/preload/index.ts' } },
  },
  renderer: {
    plugins: [react()],
  },
})
