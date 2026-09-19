/**
 * src/app/api/billing/checkout/route.ts
 *
 * POST /api/billing/checkout   (no body; the user comes from the session cookie)
 *
 * BILLING_MODE=mock (default): pretends the payment succeeded and upgrades the
 * user immediately, so you can test the whole Free → Pro flow without a
 * payment provider.
 *
 * Going live with Razorpay or Stripe: replace the mock branch with
 *   1. create an order/subscription (Razorpay) or Checkout Session (Stripe)
 *      with { user_id: user.id } in its metadata/notes,
 *   2. return its id/URL so the browser opens the provider's payment page,
 *   3. leave the upgrade to ../webhook, which the provider calls after the
 *      money is captured.
 * Never upgrade because the BROWSER says the payment worked.
 */
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { CONFIG } from "@/config/generation";
import { activatePro } from "@/lib/billing";
import { getCurrentUser } from "@/lib/auth/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", 401);
  // The guest user is shared by all visitors, so upgrading it would give everyone Pro.
  if (user.guest) return fail("login_required", 403);

  if ((process.env.BILLING_MODE ?? "mock") !== "mock") {
    return fail("not_implemented", 501); // real provider: see the note above
  }

  // Safety net: an accidentally deployed mock would give everyone Pro for free.
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_MOCK_BILLING !== "true") {
    return fail("mock_billing_disabled", 403);
  }

  try {
    const applied = await activatePro({
      userId: user.id,
      provider: "mock",
      paymentId: `mock_${randomUUID()}`,
      amount: CONFIG.pro.priceInr * 100, // paise
      currency: "INR",
    });
    return NextResponse.json({ ok: true, applied });
  } catch (err) {
    console.error("[billing/checkout]", err);
    return fail("server_error", 500);
  }
}
