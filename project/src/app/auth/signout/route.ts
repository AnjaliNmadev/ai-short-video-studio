/**
 * src/app/auth/signout/route.ts
 *
 * POST /auth/signout: clears the session cookie, then goes to /login.
 * POST only, so a stray <img src="/auth/signout"> on another site can't log people out.
 */
import { NextResponse } from "next/server";
import { siteUrl } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // 303 turns the POST into a GET on /login.
  return NextResponse.redirect(`${siteUrl(request)}/login`, 303);
}
