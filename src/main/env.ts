// src/main/env.ts
// In dev: loaded from .env.local via dotenv
// In prod: injected at build time via electron-vite define
export const DB_URL = process.env['DATABASE_URL'] ?? ''
export const SUPABASE_URL_VAL = process.env['SUPABASE_URL'] ?? ''
export const SUPABASE_ANON_KEY_VAL = process.env['SUPABASE_ANON_KEY'] ?? ''
