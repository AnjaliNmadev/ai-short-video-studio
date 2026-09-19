/**
 * src/lib/supabase/server.ts
 *
 * Supabase client bound to the current request's cookies. It acts as the
 * logged-in user, so Row Level Security applies. Use it to identify the user.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a context where cookies are read-only (e.g. a Server
            // Component). Safe to ignore when middleware refreshes sessions.
          }
        },
      },
    }
  );
}
