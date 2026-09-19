/**
 * src/lib/billing.ts
 *
 * Provider-agnostic "the user paid" / "the subscription ended" operations.
 * The mock checkout, the Razorpay webhook, and a future Stripe webhook all call
 * these two functions, so the rest of the app never cares who took the money.
 *
 * Both run as SQL functions (see supabase/part4.sql) so the payment record and
 * the plan change commit together.
 */
import "server-only";
import { CONFIG } from "@/config/generation";
import { getAdminClient } from "@/lib/supabase/admin";

export type PaymentInfo = {
  userId: string;
  provider: "mock" | "razorpay" | "stripe";
  /** The provider's payment id. It is the idempotency key. */
  paymentId: string;
  /** Smallest currency unit (paise / cents). */
  amount: number;
  currency: string;
};

/**
 * Sets is_pro = true and adds CONFIG.pro.monthlyCredits to the balance.
 * Safe to call twice with the same payment (webhooks retry): the second call
 * changes nothing and returns false.
 */
export async function activatePro(p: PaymentInfo): Promise<boolean> {
  const { data, error } = await getAdminClient().rpc("activate_pro", {
    p_user_id: p.userId,
    p_provider: p.provider,
    p_payment_id: p.paymentId,
    p_amount: p.amount,
    p_currency: p.currency,
    p_credits: CONFIG.pro.monthlyCredits,
  });
  if (error) throw new Error(`activate_pro failed: ${error.message}`);
  return data as boolean;
}

/** Sets is_pro = false. Remaining credits are kept. */
export async function deactivatePro(userId: string): Promise<void> {
  const { error } = await getAdminClient().rpc("deactivate_pro", {
    p_user_id: userId,
  });
  if (error) throw new Error(`deactivate_pro failed: ${error.message}`);
}
