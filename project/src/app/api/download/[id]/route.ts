/**
 * src/app/api/download/[id]/route.ts
 *
 * GET /api/download/<generation id>?file=video|thumbnail
 *
 * The one place that decides watermark vs. logo-free, at DOWNLOAD time:
 *
 *   Pro user + a clean master exists  → signed URL to the private clean file
 *   anyone else                       → the public file (which carries the logo
 *                                       if it was generated on the Free plan)
 *
 * Because the decision is made now, not at generation time, a Free user who
 * upgrades gets logo-free downloads of videos they made BEFORE upgrading.
 * The redirect target sends Content-Disposition: attachment, so the browser
 * saves the file instead of navigating to it.
 *
 * Status codes: 302 redirect · 400 bad input · 401 not signed in ·
 *               404 not yours / doesn't exist · 500 server error
 */
import { NextResponse } from "next/server";
import { CONFIG } from "@/config/generation";
import { getCreditStatus } from "@/lib/credits";
import { signCleanDownload } from "@/lib/storage-clean";
import { getAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FILES = {
  video: { object: "video.mp4", ext: "mp4" },
  thumbnail: { object: "thumbnail.jpg", ext: "jpg" },
} as const;

const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

const goTo = (url: string) => {
  const res = NextResponse.redirect(url, 302);
  res.headers.set("Cache-Control", "no-store"); // never cache a per-user decision
  return res;
};

/** ASCII-safe download name. Topics in other scripts fall back to the id. */
function downloadName(topic: string, id: string, ext: string) {
  const slug = topic
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return `short-studio-${slug || id.slice(0, 8)}.${ext}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const file = new URL(request.url).searchParams.get("file");
  if (!UUID.test(id) || (file !== "video" && file !== "thumbnail")) {
    return fail("bad_request", 400);
  }

  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", 401);

  // The admin client bypasses RLS, so ownership is enforced by hand: the row
  // must belong to this user.
  const { data: gen, error } = await getAdminClient()
    .from("generations")
    .select("id, topic, metadata_json")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    console.error("[download] lookup failed", error.message);
    return fail("server_error", 500);
  }
  if (!gen) return fail("not_found", 404);

  const meta = (gen.metadata_json ?? {}) as {
    watermarked?: boolean;
    clean_master?: boolean;
  };
  const { object, ext } = FILES[file];
  const objectPath = `${user.id}/${gen.id}/${object}`; // same layout /api/generate writes
  const filename = downloadName(gen.topic ?? "", gen.id, ext);

  // Only Free-plan generations have a private clean master to swap in.
  if (meta.watermarked && meta.clean_master) {
    let isPro: boolean;
    try {
      ({ isPro } = await getCreditStatus(user.id));
    } catch (err) {
      console.error("[download] could not read plan", err);
      return fail("server_error", 500);
    }

    if (isPro) {
      const signed = await signCleanDownload(objectPath, filename);
      if (signed) return goTo(signed);
      // Missing object: serve the watermarked copy rather than failing the download.
      console.error("[download] clean master missing", objectPath);
    }
  }

  const { data } = getAdminClient()
    .storage.from(CONFIG.storageBucket)
    .getPublicUrl(objectPath, { download: filename });
  return goTo(data.publicUrl);
}
