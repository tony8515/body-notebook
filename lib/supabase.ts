import { createClient } from "@supabase/supabase-js";

/**
 * ✅ Single shared Supabase client (browser-safe)
 * - Uses NEXT_PUBLIC_* env vars
 * - Persists session
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  // Helps surface misconfigured env vars early
  // (This runs in the browser at runtime in Next.js)
  console.warn(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Check .env.local and Vercel env vars."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
