/**
 * src/app/auth/callback/route.ts
 *
 * GET /auth/callback?code=...&next=/create
 *
 * Landing point for Google sign-in and for email-confirmation links that use
 * the default (PKCE) template. Exchanges the one-time code for a session cookie.
 */
import { NextResponse } from "next/server";
import { safeNext, siteUrl } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const base = siteUrl(request);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${base}${next}`);
    console.error("[auth/callback] code exchange failed:", error.message);
  }

  return NextResponse.redirect(`${base}/login?error=auth_failed`);
}
