import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { lib: { entry: 'src/main/index.ts' } },
    define: {
      'process.env.DATABASE_URL': JSON.stringify(process.env.DATABASE_URL ?? ''),
      'process.env.SUPABASE_URL': JSON.stringify(process.env.SUPABASE_URL ?? ''),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(process.env.SUPABASE_ANON_KEY ?? ''),
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
