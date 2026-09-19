/**
 * src/app/api/me/route.ts
 *
 * GET /api/me → { email, creditsLeft, isPro, unlimited }
 * Feeds the header pill on /create and the /billing page.
 */
import { NextResponse } from "next/server";
import { CONFIG } from "@/config/generation";
import { getCreditStatus } from "@/lib/credits";
import { getCurrentUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const { creditsLeft, isPro } = await getCreditStatus(user.id);
    return NextResponse.json(
      {
        email: user.email,
        guest: user.guest,
        creditsLeft,
        isPro,
        // true when this user is never charged (Pro + CONFIG.proSkipsCredits)
        unlimited: isPro && CONFIG.proSkipsCredits,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[api/me]", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
