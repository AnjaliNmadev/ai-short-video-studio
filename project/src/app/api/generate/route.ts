/**
 * src/app/api/generate/route.ts
 *
 * POST /api/generate   body: { "topic": string }
 *
 * Flow
 *   1. Authenticate the user (Supabase session cookie)
 *   2. Validate the topic
 *   3. Check plan + credits, then charge atomically   → 402 if not enough
 *   4. LLM: script, scene prompts, platform copy
 *   5. In parallel: voiceover (ElevenLabs), video clips + thumbnail (fal.ai)
 *   6. Render a CLEAN MP4 + thumbnail. Free users also get a watermarked copy.
 *   7. Upload to Supabase Storage and save the row in `generations`.
 *        public bucket  → what the dashboard shows (watermarked for Free users)
 *        private bucket → the clean master of Free users' files, so if they
 *                         upgrade later /api/download/[id] can serve it logo-free
 *   8. Return JSON for the dashboard. If ANY step fails, refund the credit.
 *
 * Status codes: 200 ok · 400 bad input · 401 not signed in · 402 no credits
 *               500 server error · 502 generation failed (credit refunded)
 */
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { CONFIG } from "@/config/generation";
import { generateContentPlan } from "@/lib/ai/script";
import { generateClips, generateThumbnailImage } from "@/lib/ai/video";
import { synthesizeVoiceover } from "@/lib/ai/voice";
import {
  consumeCredits,
  getCreditStatus,
  InsufficientCreditsError,
  refundCredits,
} from "@/lib/credits";
import {
  assembleVideo,
  assertWatermarkExists,
  prepareThumbnail,
  watermarkVideo,
} from "@/lib/media/assemble";
import { removeFiles, uploadPublic } from "@/lib/storage";
import { removeCleanFiles, uploadClean } from "@/lib/storage-clean";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { GenerationResult } from "@/types/generation";

// ffmpeg, sharp, and fs need the Node.js runtime (not Edge).
export const runtime = "nodejs";
// Generation takes minutes. Raise/lower to match your host's limit.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

/** Logs how long each stage takes, which helps you find the slow (and costly) part. */
async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    console.info(`[generate] ${label}: ${Date.now() - start} ms`);
  }
}

/** Returns a cleaned topic, or null if the body is invalid. */
async function readTopic(request: Request): Promise<string | null> {
  try {
    const body = await request.json();
    if (typeof body?.topic !== "string") return null;
    const topic = body.topic.trim().replace(/\s+/g, " ");
    const { min, max } = CONFIG.topic;
    return topic.length >= min && topic.length <= max ? topic : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  /* ---------------------------- 1. Authenticate ---------------------------- */
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("unauthorized", 401);

  /* ----------------------------- 2. Validate ------------------------------- */
  const topic = await readTopic(request);
  if (!topic) return fail("invalid_topic", 400);

  // TODO (recommended): run a moderation check on `topic` here, BEFORE charging.

  /* ------------------------ 3. Plan, credits, charge ----------------------- */
  let status;
  try {
    status = await getCreditStatus(user.id);
  } catch (err) {
    console.error("[generate] could not read credits", err);
    return fail("server_error", 500);
  }

  const isPro = status.isPro;
  const watermark = !isPro; // Free plan → watermark; Pro → clean video
  const shouldCharge = !(isPro && CONFIG.proSkipsCredits);

  // Fast rejection so we don't do any work for users with an empty balance.
  if (shouldCharge && status.creditsLeft < CONFIG.creditCostPerVideo) {
    return fail("insufficient_credits", 402);
  }

  // Fail BEFORE charging if the server is misconfigured.
  if (watermark) {
    try {
      await assertWatermarkExists();
    } catch (err) {
      console.error("[generate]", err);
      return fail("server_error", 500);
    }
  }

  // The SQL function re-checks the balance atomically, which protects against
  // two simultaneous requests both passing the fast check above.
  let creditsLeft = status.creditsLeft;
  let charged = false;
  if (shouldCharge) {
    try {
      creditsLeft = await consumeCredits(user.id);
      charged = true;
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        return fail("insufficient_credits", 402);
      }
      console.error("[generate] could not charge credits", err);
      return fail("server_error", 500);
    }
  }

  /* ----------------------------- 4–8. Pipeline ----------------------------- */
  const generationId = randomUUID();
  const basePath = `${user.id}/${generationId}`;
  const videoPath = `${basePath}/video.mp4`;
  const thumbPath = `${basePath}/thumbnail.jpg`;
  const startedAt = Date.now();

  try {
    // 4. Script, scene prompts, and copy for all three platforms.
    const plan = await timed("script", () => generateContentPlan(topic));

    // 5. Independent jobs run in parallel to cut total wait time.
    const [voiceover, clipUrls, thumbSourceUrl] = await timed("media generation", () =>
      Promise.all([
        synthesizeVoiceover(plan.narration),
        generateClips(plan.scenes.map((s) => s.visualPrompt)),
        generateThumbnailImage(plan.thumbnailPrompt),
      ])
    );

    // 6. Always render a CLEAN master first. Free users additionally get a
    //    watermarked copy (a fast overlay pass over the master).
    const [cleanVideo, cleanThumb, markedThumb] = await timed("assembly", () =>
      Promise.all([
        assembleVideo({ clipUrls, audio: voiceover, watermark: false }),
        prepareThumbnail(thumbSourceUrl, false),
        watermark ? prepareThumbnail(thumbSourceUrl, true) : Promise.resolve(null),
      ])
    );
    const markedVideo = watermark
      ? await timed("watermark", () => watermarkVideo(cleanVideo))
      : null;

    // 7a. Upload. The public bucket gets what the dashboard displays. For Free
    //     users the clean master also goes to the private bucket (no public URL).
    const [videoUrl, thumbnailUrl] = await timed("upload", () =>
      Promise.all([
        uploadPublic(videoPath, markedVideo ?? cleanVideo, "video/mp4"),
        uploadPublic(thumbPath, markedThumb ?? cleanThumb, "image/jpeg"),
        watermark ? uploadClean(videoPath, cleanVideo, "video/mp4") : undefined,
        watermark ? uploadClean(thumbPath, cleanThumb, "image/jpeg") : undefined,
      ] as const)
    );

    // 7b. Save the generation. The service role is required because RLS gives
    //     clients read-only access to this table.
    const { error: insertError } = await getAdminClient()
      .from("generations")
      .insert({
        id: generationId,
        user_id: user.id,
        topic,
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        metadata_json: {
          narration: plan.narration,
          scenes: plan.scenes,
          thumbnail_prompt: plan.thumbnailPrompt,
          platforms: plan.platforms, // lets the Library page show copy later
          watermarked: watermark,
          // true → a logo-free master exists in the private bucket (see /api/download)
          clean_master: watermark,
          duration_ms: Date.now() - startedAt,
        },
      });
    if (insertError) throw new Error(`DB insert failed: ${insertError.message}`);

    // 8. Respond in the shape the dashboard expects.
    const result: GenerationResult = {
      id: generationId,
      topic,
      videoUrl,
      thumbnailUrl,
      platforms: plan.platforms,
      creditsLeft,
    };
    return NextResponse.json(result);
  } catch (err) {
    // Full details go to the server log; the client only gets a generic error.
    console.error(`[generate] failed for user ${user.id}`, err);

    // Remove any partial uploads (no-op if nothing was uploaded).
    await removeFiles([videoPath, thumbPath]);
    if (watermark) await removeCleanFiles([videoPath, thumbPath]);

    // Give the credit back so the person isn't charged for a failed video.
    if (charged) {
      try {
        await refundCredits(user.id);
      } catch (refundErr) {
        // Alert on this in production: someone was charged for nothing.
        console.error(`[generate] REFUND FAILED for user ${user.id}`, refundErr);
      }
    }

    return fail("generation_failed", 502);
  }
}
