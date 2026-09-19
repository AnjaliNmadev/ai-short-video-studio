/**
 * src/lib/auth/current-user.ts
 *
 * One place that answers "who is making this request?".
 *
 *   AUTH_DISABLED=true  → nobody logs in. Every visitor is ONE shared "guest"
 *                         user (created automatically on first use). They share
 *                         that user's credits, so the credits table is your
 *                         spending limit while auth is off.
 *   otherwise           → the real Supabase session user (normal behaviour).
 *
 * To turn login back on: delete the AUTH_DISABLED variable and redeploy.
 */
import "server-only";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AppUser = { id: string; email: string | null; guest: boolean };

export const isAuthDisabled = () => process.env.AUTH_DISABLED === "true";

const GUEST_EMAIL = "guest@short-studio.example.com";
let cachedGuestId: string | null = process.env.GUEST_USER_ID ?? null;

async function findGuestId(): Promise<string | null> {
  const { data } = await getAdminClient()
    .from("users")
    .select("id")
    .eq("email", GUEST_EMAIL)
    .maybeSingle();
  return data?.id ?? null;
}

async function getGuestId(): Promise<string> {
  if (cachedGuestId) return cachedGuestId;

  let id = await findGuestId();
  if (!id) {
    const admin = getAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: GUEST_EMAIL,
      email_confirm: true,
    });
    if (error || !data.user) {
      // Two requests may race to create it; if so the other one won.
      id = await findGuestId();
      if (!id) throw new Error(`Could not create guest user: ${error?.message}`);
    } else {
      id = data.user.id;
    }
    // The signup trigger normally creates these rows; this is a safety net.
    await admin
      .from("users")
      .upsert({ id, email: GUEST_EMAIL }, { onConflict: "id", ignoreDuplicates: true });
    await admin
      .from("credits")
      .upsert({ user_id: id }, { onConflict: "user_id", ignoreDuplicates: true });
  }

  cachedGuestId = id;
  return id;
}

export async function getCurrentUser(): Promise<AppUser | null> {
  if (isAuthDisabled()) {
    return { id: await getGuestId(), email: null, guest: true };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email ?? null, guest: false } : null;
}
