/**
 * src/lib/ai/video.ts
 *
 * Step 2b: visual generation with Replicate (https://replicate.com/explore).
 *   - generateClips()          → one short AI video clip per scene
 *   - generateThumbnailImage() → one vertical thumbnail image
 *
 * Model IDs and input fields differ per model and change over time, so check
 * the model page on Replicate and adjust the `input` objects below if needed.
 * Both IDs are overridable through environment variables.
 *
 * New Replicate accounts get a small amount of trial credit — after that it's
 * pay-as-you-go per second of compute (no recurring free tier for video).
 *
 * Using fal.ai instead? Swap the two replicate.run() calls for fal.subscribe()
 * calls (see fal.ai's docs for the equivalent model IDs). Nothing else in the
 * pipeline changes.
 */
import "server-only";
import Replicate from "replicate";
import { CONFIG } from "@/config/generation";
import { withRetry } from "@/lib/utils/retry";

let client: Replicate | null = null;
/** Lazily created; the SDK reads REPLICATE_API_TOKEN from the environment. */
const getClient = () => (client ??= new Replicate());

const VIDEO_MODEL =
  process.env.REPLICATE_VIDEO_MODEL ?? "minimax/video-01";
const IMAGE_MODEL =
  process.env.REPLICATE_IMAGE_MODEL ?? "black-forest-labs/flux-schnell";

/** Appended to every prompt so the clips look like one video. */
const STYLE_SUFFIX =
  "Vertical 9:16 framing, cinematic lighting, smooth camera motion, consistent color grade. No text, captions, watermarks, or logos.";

/**
 * Replicate's `run()` can return a plain URL string, an array of them, or (on
 * newer SDK versions) a FileOutput object with an async `.url()` method —
 * the exact shape depends on the model. This normalizes all of them to a URL.
 */
async function extractUrl(output: unknown): Promise<string> {
  const item = Array.isArray(output) ? output[0] : output;

  if (typeof item === "string") return item;

  if (item && typeof (item as { url?: unknown }).url === "function") {
    const url = await (item as { url: () => Promise<URL> | URL }).url();
    return url.toString();
  }

  if (item instanceof URL) return item.toString();

  throw new Error("Replicate response did not contain a recognizable URL");
}

async function generateClip(visualPrompt: string): Promise<string> {
  const output = await getClient().run(VIDEO_MODEL as `${string}/${string}`, {
    input: {
      prompt: `${visualPrompt} ${STYLE_SUFFIX}`,
      duration: CONFIG.scenes.secondsPerClip,
      aspect_ratio: "9:16",
    },
  });

  return extractUrl(output);
}

/**
 * Generates all clips in parallel and returns their URLs in scene order.
 * Note: if one clip fails, the others may still finish (and still be billed).
 */
export async function generateClips(visualPrompts: string[]): Promise<string[]> {
  return Promise.all(visualPrompts.map((p) => withRetry(() => generateClip(p))));
}

/** Returns the URL of a generated vertical thumbnail image. */
export async function generateThumbnailImage(prompt: string): Promise<string> {
  return withRetry(async () => {
    const output = await getClient().run(IMAGE_MODEL as `${string}/${string}`, {
      input: {
        prompt: `${prompt} Bold, uncluttered vertical poster composition. No text.`,
        aspect_ratio: "9:16",
        num_outputs: 1,
      },
    });

    return extractUrl(output);
  });
}
