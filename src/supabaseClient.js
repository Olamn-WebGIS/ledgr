import { createClient } from '@supabase/supabase-js';

const fallbackSupabaseUrl = 'https://bvhbiqejgfpqcnahbrmr.supabase.co';
const fallbackSupabaseAnonKey = 'sb_publishable_8Shoray3H7SLN6p4MeHGHA_rLcvO1ig';
const configuredSupabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const configuredSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

const hasRealSupabaseCredentials = Boolean(configuredSupabaseUrl && configuredSupabaseAnonKey);

export const isSupabaseConfigured = hasRealSupabaseCredentials;
export const supabaseConfigWarning = isSupabaseConfigured
  ? ''
  : 'Supabase is not configured yet. Replace the placeholder VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY values in your .env file with your real project credentials before trying to save data.';

const supabaseUrl = configuredSupabaseUrl || fallbackSupabaseUrl;
const supabaseAnonKey = configuredSupabaseAnonKey || fallbackSupabaseAnonKey;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    flowType: 'pkce',
  },
});
