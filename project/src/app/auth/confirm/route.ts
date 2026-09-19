/**
 * src/app/auth/confirm/route.ts
 *
 * GET /auth/confirm?token_hash=...&type=email&next=/create
 *
 * Email-confirmation endpoint that works even when the link is opened on a
 * different device than the one that signed up (the PKCE /auth/callback flow
 * can't). To use it, edit Supabase → Authentication → Email Templates →
 * "Confirm signup" so the link is:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
 */
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { safeNext, siteUrl } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const base = siteUrl(request);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"));

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${base}${next}`);
    console.error("[auth/confirm] verifyOtp failed:", error.message);
  }

  return NextResponse.redirect(`${base}/login?error=auth_failed`);
}
