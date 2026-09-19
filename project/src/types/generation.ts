/**
 * src/types/generation.ts
 *
 * Shared types. `GenerationResult` matches what the Part 2 dashboard expects
 * from POST /api/generate (creditsLeft is an optional bonus field).
 */

export type PlatformKey = "youtube" | "instagram" | "facebook";

export type PlatformCopy = {
  title: string;
  description: string;
  /** Plain words without "#". The UI adds "#" for Instagram/Facebook. */
  tags: string[];
};

/** What the LLM returns: everything needed to produce one video. */
export type ContentPlan = {
  /** Voiceover script (spoken text only). */
  narration: string;
  /** One visual prompt per video clip, in playback order. */
  scenes: { visualPrompt: string }[];
  /** Prompt for the thumbnail image. */
  thumbnailPrompt: string;
  platforms: Record<PlatformKey, PlatformCopy>;
};

/** JSON returned to the frontend. */
export type GenerationResult = {
  id: string;
  topic: string;
  videoUrl: string;
  thumbnailUrl: string;
  platforms: Record<PlatformKey, PlatformCopy>;
  creditsLeft: number;
};
