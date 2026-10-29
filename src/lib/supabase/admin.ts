import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Service-role client for background jobs and invite handling. Bypasses RLS. */
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
