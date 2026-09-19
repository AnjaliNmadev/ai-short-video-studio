/**
 * src/lib/supabase/admin.ts
 *
 * Service-role client. It BYPASSES Row Level Security, so it can write to
 * `credits` and `generations`. Never import this into client components:
 * the "server-only" import makes the build fail if you do.
 */
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return adminClient;
}
