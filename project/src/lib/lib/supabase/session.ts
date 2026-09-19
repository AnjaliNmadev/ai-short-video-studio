/**
 * src/lib/supabase/session.ts
 *
 * Called from src/proxy.ts on every page request.
 *   1. Refreshes the Supabase session cookie before the access token expires.
 *   2. Sends signed-out visitors to /login and signed-in visitors away from it.
 *
 * This is a convenience layer, NOT the security boundary: every route handler
 * still calls supabase.auth.getUser() itself (see /api/generate, /api/download).
 */
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/** Pages a signed-out visitor may open. Everything else needs a session. */
const PUBLIC_EXACT = ["/"];
const PUBLIC_PREFIXES = ["/login", "/auth"];

const isPublic = (pathname: string) =>
  PUBLIC_EXACT.includes(pathname) ||
  PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/** A redirect must carry the refreshed auth cookies, or the refresh is lost. */
function redirectKeepingCookies(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Keep this call directly after createServerClient(): it validates the token
  // with Supabase and triggers the cookie refresh above.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  // API routes answer 401 themselves (JSON, not a redirect to an HTML page).
  if (pathname.startsWith("/api/")) return response;

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname + search);
    return redirectKeepingCookies(url, response);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/create";
    url.search = "";
    return redirectKeepingCookies(url, response);
  }

  return response;
}
