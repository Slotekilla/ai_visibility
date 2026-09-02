import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL;

const supabaseKey =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY;

export function createSupabaseServerClient() {
  if (!supabaseUrl) {
    throw new Error('Supabase URL manjka. Dodaj NEXT_PUBLIC_SUPABASE_URL v Vercel Environment Variables.');
  }
  if (!supabaseKey) {
    throw new Error('Supabase ključ manjka. Dodaj NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY v Vercel Environment Variables.');
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
