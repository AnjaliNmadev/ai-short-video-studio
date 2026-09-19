"use client";

/**
 * src/app/(dashboard)/billing/page.tsx
 *
 * Plan status + upgrade button. With BILLING_MODE=mock (default) the button
 * upgrades you instantly and no money moves. Real providers: see
 * src/app/api/billing/checkout/route.ts.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { CONFIG } from "@/config/generation";

type Me = { email: string | null; creditsLeft: number; isPro: boolean; unlimited: boolean };

export default function BillingPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setMe(data))
      .catch(() => {});

  useEffect(() => {
    refresh();
  }, []);

  async function upgrade() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      if (!res.ok) throw new Error();
      await refresh();
    } catch {
      setError("The payment didn't go through and you weren't charged. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const perks = [
    `${CONFIG.pro.monthlyCredits} credits every month`,
    "No Short Studio logo on downloads, including videos you've already made",
    "Same one-credit-per-video pricing",
  ];

  return (
    <div className="min-h-dvh bg-base font-body text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4 sm:px-6">
          <Link href="/create" className="text-sm text-muted hover:text-ink">
            ← Back to Studio
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Plans</h1>
        <p className="mt-2 text-muted">
          {me === null
            ? "Loading your plan…"
            : me.isPro
              ? "You're on the Pro plan."
              : `You're on the Free plan with ${me.creditsLeft} ${
                  me.creditsLeft === 1 ? "credit" : "credits"
                } left.`}
        </p>

        <section className="mt-8 rounded-2xl border border-line bg-surface p-6">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-xl font-semibold">Pro</h2>
            <p>
              <span className="text-2xl font-semibold tabular-nums">
                ₹{CONFIG.pro.priceInr}
              </span>
              <span className="text-sm text-muted"> / month</span>
            </p>
          </div>

          <ul className="mt-4 space-y-2 text-sm">
            {perks.map((perk) => (
              <li key={perk} className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                {perk}
              </li>
            ))}
          </ul>

          {error && (
            <p role="alert" className="mt-4 text-sm text-danger">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={upgrade}
            disabled={busy || me === null || me.isPro}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {me?.isPro ? "You're on Pro" : "Upgrade to Pro"}
          </button>
          <p className="mt-3 text-center text-xs text-muted">
            Test mode: upgrading here doesn't charge anything.
          </p>
        </section>
      </main>
    </div>
  );
}
