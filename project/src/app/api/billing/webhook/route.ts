/**
 * src/app/api/billing/webhook/route.ts
 *
 * POST /api/billing/webhook   ← called by Razorpay, not by the browser.
 *
 * Razorpay dashboard → Settings → Webhooks: add this URL, choose a secret
 * (= RAZORPAY_WEBHOOK_SECRET), and enable payment.captured, subscription.charged,
 * subscription.cancelled, subscription.halted, subscription.completed.
 * Create your orders/subscriptions with notes: { user_id } so a payment can be
 * matched to a user. Check the payload paths below against a real test event.
 *
 * Stripe instead? Swap validSignature() for
 *   stripe.webhooks.constructEvent(rawBody, signatureHeader, secret)
 * and map checkout.session.completed / invoice.paid → activatePro and
 * customer.subscription.deleted → deactivatePro. Everything else stays.
 *
 * Status codes: 200 handled or ignored · 400 bad signature/body ·
 *               500 our error (the provider retries, and activatePro is idempotent)
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { activatePro, deactivatePro } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Razorpay signs the RAW request body with HMAC-SHA256 (hex). */
function validSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function POST(request: Request) {
  // Read the body as text: parsing it first would change the bytes that were signed.
  const rawBody = await request.text();
  if (!validSignature(rawBody, request.headers.get("x-razorpay-signature"))) {
    return new NextResponse("invalid signature", { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new NextResponse("invalid body", { status: 400 });
  }

  const payment = event?.payload?.payment?.entity;
  const subscription = event?.payload?.subscription?.entity;
  const userId: unknown = subscription?.notes?.user_id ?? payment?.notes?.user_id;

  // Not one of ours (or created without notes): acknowledge so it isn't retried.
  if (typeof userId !== "string" || !UUID.test(userId)) {
    console.warn("[billing/webhook] no valid user_id in", event?.event);
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    switch (event.event) {
      case "payment.captured":
      case "subscription.charged":
        if (payment?.id) {
          await activatePro({
            userId,
            provider: "razorpay",
            paymentId: payment.id,
            amount: payment.amount,
            currency: payment.currency,
          });
        }
        break;

      case "subscription.cancelled":
      case "subscription.halted":
      case "subscription.completed":
        await deactivatePro(userId);
        break;
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[billing/webhook] failed", event?.event, err);
    return new NextResponse("server error", { status: 500 });
  }
}
