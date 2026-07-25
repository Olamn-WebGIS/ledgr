import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL?.trim() || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY?.trim() || '';

if (!supabaseUrl || !supabaseKey) {
  // Warn instead of throwing so serverless functions initialize quickly.
  // Runtime controller calls will receive clearer errors when credentials are missing.
  // eslint-disable-next-line no-console
  console.warn('SUPABASE_URL or SUPABASE_SERVICE_KEY not set; Supabase client initialized with empty keys.');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});
