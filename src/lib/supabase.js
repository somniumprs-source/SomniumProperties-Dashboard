import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mjgusjuougzoeiyavsor.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

if (!supabaseAnonKey) {
  console.warn('[auth] VITE_SUPABASE_ANON_KEY não configurada — auth desativado')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
