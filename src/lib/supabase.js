import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mjgusjuougzoeiyavsor.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const authEnabled = !!supabaseAnonKey

export const supabase = authEnabled
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null
