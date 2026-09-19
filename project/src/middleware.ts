/**
 * src/proxy.ts   (Next.js 16+)
 *
 * On Next.js 15 or older, name this file src/middleware.ts and rename the
 * exported function to `middleware`. Nothing else changes.
 */
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Skip static files and images; everything else gets its session refreshed.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp4)$).*)",
  ],
};
