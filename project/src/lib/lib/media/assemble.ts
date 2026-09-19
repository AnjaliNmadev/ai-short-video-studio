/**
 * src/lib/media/assemble.ts
 *
 * Step 3: media processing.
 *   - assembleVideo():   stitch AI clips + voiceover into one 1080x1920 MP4,
 *                        optionally burning in the watermark (Free plan).
 *   - prepareThumbnail(): resize the thumbnail to 1080x1920 JPEG, optionally
 *                        with the same watermark.
 *   - watermarkVideo():  overlay the logo on an already-rendered clean MP4
 *                        (fast pass; audio is copied, not re-encoded).
 *
 * Requires:  npm i ffmpeg-static sharp
 * ffmpeg needs a Node host that lets you spawn processes (Docker, Railway,
 * Render, Fly, a VPS). Plain serverless functions often can't. If you must
 * stay serverless, move this step to a worker or a render API.
 */
import "server-only";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebStream } from "node:stream/web";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { CONFIG } from "@/config/generation";

const WATERMARK_FILE = path.join(process.cwd(), CONFIG.watermarkPath);

/** Call before charging a Free user so a missing logo can't cost them a credit. */
export async function assertWatermarkExists(): Promise<void> {
  try {
    await access(WATERMARK_FILE);
  } catch {
    throw new Error(`Watermark file not found at ${CONFIG.watermarkPath}`);
  }
}

/* --------------------------------- Helpers --------------------------------- */

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
  await pipeline(
    Readable.fromWeb(res.body as unknown as NodeWebStream),
    createWriteStream(dest)
  );
}

function runFfmpeg(args: string[], timeoutMs = 180_000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error("ffmpeg binary not found"));

    const proc = spawn(ffmpegPath, ["-y", "-hide_banner", "-loglevel", "error", ...args]);

    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-2000); // keep the last 2 KB
    });

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("ffmpeg timed out"));
    }, timeoutMs);

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
    });
  });
}

/* --------------------------------- Video ----------------------------------- */

type AssembleInput = {
  clipUrls: string[];
  audio: Buffer;
  /** true for Free-plan users. */
  watermark: boolean;
};

/**
 * Pipeline: crop each clip to 9:16 → concatenate → (optional) logo overlay →
 * mux with the voiceover. Video is padded by freezing the last frame if the
 * narration is longer than the clips; output stops when the audio ends.
 */
export async function assembleVideo({
  clipUrls,
  audio,
  watermark,
}: AssembleInput): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "gen-"));

  try {
    // 1. Download clips and write the voiceover to disk.
    const clipPaths = await Promise.all(
      clipUrls.map(async (url, i) => {
        const dest = path.join(dir, `clip${i}.mp4`);
        await download(url, dest);
        return dest;
      })
    );
    const audioPath = path.join(dir, "voice.mp3");
    await writeFile(audioPath, audio);
    const outPath = path.join(dir, "out.mp4");

    // 2. Input list: clips first, then audio, then (optionally) the logo.
    const inputArgs: string[] = [];
    clipPaths.forEach((p) => inputArgs.push("-i", p));
    inputArgs.push("-i", audioPath);
    if (watermark) inputArgs.push("-i", WATERMARK_FILE);

    const n = clipPaths.length;
    const audioIndex = n;
    const logoIndex = n + 1;
    const { width, height, fps, maxSeconds } = CONFIG.video;

    // 3. Filter graph.
    const filters: string[] = [];

    // Scale + center-crop every clip to exactly 1080x1920 at the same fps.
    clipPaths.forEach((_, i) => {
      filters.push(
        `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
          `crop=${width}:${height},setsar=1,fps=${fps},format=yuv420p[v${i}]`
      );
    });

    // Concatenate, then allow up to 15 s of frozen last frame as padding.
    const joined = clipPaths.map((_, i) => `[v${i}]`).join("");
    filters.push(
      `${joined}concat=n=${n}:v=1:a=0,tpad=stop_mode=clone:stop_duration=15` +
        (watermark ? "[base]" : "[vout]")
    );

    // Free plan: overlay the logo at the top-right (clear of the Shorts/Reels UI).
    if (watermark) {
      filters.push(
        `[${logoIndex}:v]scale=${CONFIG.watermarkWidth}:-1[wm]`,
        `[base][wm]overlay=W-w-${CONFIG.watermarkMarginRight}:${CONFIG.watermarkTop}[vout]`
      );
    }

    // 4. Encode.
    await runFfmpeg([
      ...inputArgs,
      "-filter_complex", filters.join(";"),
      "-map", "[vout]",
      "-map", `${audioIndex}:a`,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-c:a", "aac",
      "-b:a", "128k",
      "-shortest", // stop when the voiceover ends
      "-t", String(maxSeconds), // hard cap on length
      "-movflags", "+faststart", // start playing before fully downloaded
      outPath,
    ]);

    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/* -------------------------------- Thumbnail -------------------------------- */

/** Downloads the AI image, crops it to 1080x1920, and applies the watermark for Free users. */
export async function prepareThumbnail(
  imageUrl: string,
  watermark: boolean
): Promise<Buffer> {
  const res = await fetch(imageUrl, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Thumbnail download failed (${res.status})`);
  const input = Buffer.from(await res.arrayBuffer());

  const { width, height } = CONFIG.video;
  let image = sharp(input).resize(width, height, { fit: "cover" });

  if (watermark) {
    const logo = await sharp(WATERMARK_FILE)
      .resize({ width: CONFIG.watermarkWidth })
      .toBuffer();

    // Same position as the video overlay: top-right with a 40 px margin.
    image = image.composite([
      {
        input: logo,
        top: CONFIG.watermarkTop,
        left: width - CONFIG.watermarkWidth - CONFIG.watermarkMarginRight,
      },
    ]);
  }

  return image.jpeg({ quality: 88 }).toBuffer();
}

/* ------------------------- Watermark an existing MP4 ------------------------ */

/**
 * Takes a finished CLEAN video and returns a copy with the logo burned in at
 * the same position assembleVideo() uses. The generate route renders the clean
 * master once and calls this for Free users, so the clean file can be kept
 * privately and served later if the user upgrades.
 */
export async function watermarkVideo(video: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "wm-"));

  try {
    const inPath = path.join(dir, "in.mp4");
    const outPath = path.join(dir, "out.mp4");
    await writeFile(inPath, video);

    await runFfmpeg([
      "-i", inPath,
      "-i", WATERMARK_FILE,
      "-filter_complex",
      `[1:v]scale=${CONFIG.watermarkWidth}:-1[wm];` +
        `[0:v][wm]overlay=W-w-${CONFIG.watermarkMarginRight}:${CONFIG.watermarkTop}[vout]`,
      "-map", "[vout]",
      "-map", "0:a?", // keep the voiceover if present
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-c:a", "copy", // audio is untouched, so no second lossy encode
      "-movflags", "+faststart",
      outPath,
    ]);

    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
