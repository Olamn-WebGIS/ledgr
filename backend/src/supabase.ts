import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  // Warn instead of throwing so serverless functions initialize quickly.
  // Runtime controller calls will receive clearer errors when credentials are missing.
  // eslint-disable-next-line no-console
  console.warn('SUPABASE_URL or SUPABASE_SERVICE_KEY not set; Supabase client initialized with empty keys.');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});
