/**
 * src/config/generation.ts
 *
 * One place for every tunable number in the generation pipeline.
 */
export const CONFIG = {
  /** Credits charged per generated video. */
  creditCostPerVideo: 1,

  /**
   * Business rule: does Pro mean "unlimited generations"?
   *  - false → Pro users also spend credits (you top up their balance monthly)
   *  - true  → Pro users are never charged
   * Either way, Pro users never get a watermark.
   */
  proSkipsCredits: false,

  /** Allowed topic length (matches the textarea limit in the frontend). */
  topic: { min: 3, max: 300 },

  /**
   * Scene count × seconds per clip ≈ video length.
   * 4–6 clips × 5 s ≈ 20–30 s, which fits a 55–75 word narration.
   * Each clip is a separate (paid) video-model call, so this drives your cost.
   */
  scenes: { min: 4, max: 6, secondsPerClip: 5 },

  /** Final video format (vertical 9:16). */
  video: { width: 1080, height: 1920, fps: 30, maxSeconds: 60 },

  /** Supabase Storage bucket for finished videos and thumbnails. */
  storageBucket: "generations",

  /**
   * PRIVATE bucket (no public URL). Holds the clean, un-watermarked master of
   * every video/thumbnail a Free user generates, so that if they upgrade later
   * /api/download/[id] can hand them the logo-free file via a signed URL.
   */
  cleanStorageBucket: "generations-clean",

  /** Pro plan. Placeholder numbers: change to your real pricing. */
  pro: {
    priceInr: 499, // per month; shown on /billing and charged by the mock checkout
    monthlyCredits: 100, // added to the balance on every successful payment
  },

  /** Transparent PNG placed on Free-plan videos and thumbnails. */
  watermarkPath: "public/watermark.png",
  watermarkWidth: 240,
  /** Watermark offsets from the top-right corner, in pixels. */
  watermarkMarginRight: 40,
  watermarkTop: 120,
} as const;
