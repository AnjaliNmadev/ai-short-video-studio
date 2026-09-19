/**
 * src/app/(auth)/login/page.tsx
 *
 * Server Component: reads ?next= and ?error= and hands them to the form.
 * Signed-in visitors never see this page (src/lib/supabase/session.ts redirects them).
 */
import { safeNext } from "@/lib/auth/redirect";
import AuthForm from "./auth-form";

export const metadata = { title: "Sign in · Short Studio" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <main className="grid min-h-dvh place-items-center bg-base px-4 font-body text-ink">
      <AuthForm
        next={safeNext(next)}
        initialError={error ? "Sign-in didn't complete. Please try again." : null}
      />
    </main>
  );
}
