/**
 * src/lib/supabase/client.ts
 *
 * Browser Supabase client for Client Components (the login form). It uses the
 * public anon key and stores the session in cookies, so the server-side client
 * in server.ts sees the same session.
 */
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
