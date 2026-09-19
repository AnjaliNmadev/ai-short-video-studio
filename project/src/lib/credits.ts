/**
 * src/lib/credits.ts
 *
 * Thin wrappers around the `credits` table and the `consume_credits` /
 * `refund_credits` SQL functions from schema.sql. The SQL functions do the
 * deduction atomically, so two simultaneous requests can never overspend.
 */
import "server-only";
import { CONFIG } from "@/config/generation";
import { getAdminClient } from "@/lib/supabase/admin";

export class InsufficientCreditsError extends Error {
  constructor() {
    super("insufficient_credits");
    this.name = "InsufficientCreditsError";
  }
}

export type CreditStatus = { creditsLeft: number; isPro: boolean };

/** Reads the user's balance and plan. */
export async function getCreditStatus(userId: string): Promise<CreditStatus> {
  const { data, error } = await getAdminClient()
    .from("credits")
    .select("credits_left, is_pro")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new Error(`Could not read credits: ${error?.message ?? "no row"}`);
  }
  return { creditsLeft: data.credits_left, isPro: data.is_pro };
}

/** Deducts credits atomically. Returns the new balance. */
export async function consumeCredits(
  userId: string,
  amount: number = CONFIG.creditCostPerVideo
): Promise<number> {
  const { data, error } = await getAdminClient().rpc("consume_credits", {
    p_user_id: userId,
    p_amount: amount,
  });

  if (error) {
    if (error.message.includes("insufficient_credits")) {
      throw new InsufficientCreditsError();
    }
    throw new Error(`consume_credits failed: ${error.message}`);
  }
  return data as number;
}

/** Gives credits back (used when a generation fails). Returns the new balance. */
export async function refundCredits(
  userId: string,
  amount: number = CONFIG.creditCostPerVideo
): Promise<number> {
  const { data, error } = await getAdminClient().rpc("refund_credits", {
    p_user_id: userId,
    p_amount: amount,
  });
  if (error) throw new Error(`refund_credits failed: ${error.message}`);
  return data as number;
}
