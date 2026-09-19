/**
 * src/lib/auth/redirect.ts
 *
 * Helpers for the `?next=` redirect after sign-in.
 */

/**
 * Accepts only same-site paths like "/create". Rejects "https://evil.com",
 * "//evil.com" and "/\evil.com" (browsers treat those as other sites), which
 * would otherwise turn the login flow into an open redirect.
 */
export function safeNext(value: string | null | undefined, fallback = "/create") {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }
  return value;
}

/**
 * Absolute base URL for server redirects. Behind a proxy/CDN the request URL can
 * show an internal host, so set NEXT_PUBLIC_SITE_URL (e.g. https://yourapp.com)
 * in production.
 */
export function siteUrl(request: Request) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  return base.replace(/\/$/, "");
}
