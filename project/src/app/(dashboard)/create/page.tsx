"use client";

/**
 * src/app/(dashboard)/create/page.tsx
 *
 * AI Short Video Studio: topic input, 9:16 preview, thumbnail, and
 * per-platform post copy (YouTube Shorts / Instagram Reels / Facebook Reels).
 *
 * Requires: npm i lucide-react
 * Tailwind v4 theme tokens live in globals.css (see globals.css in this delivery).
 *
 * MOCK MODE: USE_MOCK = true returns sample data so the UI works before the
 * backend exists. Set it to false to call POST /api/generate (Part 3).
 *
 * Part 4: with USE_MOCK = false the balance and plan come from GET /api/me,
 * and downloads go through GET /api/download/[id], which serves the logo-free
 * file to Pro users and the watermarked file to everyone else.
 */

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  Film,
  ImageIcon,
  Loader2,
  Pause,
  Play,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/*  Config & types                                                            */
/* -------------------------------------------------------------------------- */

const USE_MOCK = true;
const APP_NAME = "Short Studio";
const MAX_TOPIC = 300;
const INITIAL_CREDITS = 5; // Replace with the value from your `credits` table.

// Sample landscape clip (CC0). It is cropped to 9:16 with object-cover.
// Replace with the real video_url returned by your backend.
const SAMPLE_VIDEO =
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

const STAGES = [
  "Writing the script",
  "Recording the voiceover",
  "Rendering the video",
  "Designing the thumbnail",
] as const;
const STAGE_MS = USE_MOCK ? 1200 : 6000;

const SUGGESTIONS = [
  "5 habits that help you sleep better",
  "Why the moon looks bigger near the horizon",
  "How compound interest works, explained simply",
];

const PLATFORMS = [
  { key: "youtube", label: "YouTube Shorts", tagStyle: "plain" },
  { key: "instagram", label: "Instagram Reels", tagStyle: "hashtag" },
  { key: "facebook", label: "Facebook Reels", tagStyle: "hashtag" },
] as const;

type PlatformKey = (typeof PLATFORMS)[number]["key"];
type TagStyle = (typeof PLATFORMS)[number]["tagStyle"];

type PlatformCopy = { title: string; description: string; tags: string[] };

type GenerationResult = {
  id: string;
  topic: string;
  videoUrl: string;
  thumbnailUrl: string;
  platforms: Record<PlatformKey, PlatformCopy>;
  /** Balance after this generation, from the server (Part 3). */
  creditsLeft?: number;
};

type Status = "idle" | "generating" | "done" | "error";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const cx = (...c: Array<string | false | null | undefined>) =>
  c.filter(Boolean).join(" ");

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Same-origin download link. The server decides which file you get (clean for
 * Pro, watermarked for Free) and redirects with a Content-Disposition header,
 * so the browser saves it instead of playing it. Mock results have no DB row,
 * so they link the sample media directly.
 */
function downloadHref(result: GenerationResult, file: "video" | "thumbnail") {
  if (USE_MOCK) return file === "video" ? result.videoUrl : result.thumbnailUrl;
  return `/api/download/${result.id}?file=${file}`;
}

function truncate(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";
}

function keywordsFrom(topic: string): string[] {
  const stop = new Set([
    "the", "and", "for", "that", "with", "this", "your", "from",
    "what", "how", "why", "are", "you", "does", "simply",
  ]);
  const words = topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stop.has(w));
  return Array.from(new Set(words)).slice(0, 5);
}

function formatTags(tags: string[], style: TagStyle) {
  return style === "hashtag"
    ? tags.map((t) => `#${t}`).join(" ")
    : tags.join(", ");
}

function formatTime(t: number) {
  if (!Number.isFinite(t) || t < 0) return "0:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Placeholder 9:16 cover as an SVG data URI. Swap for your AI thumbnail URL. */
function makeThumbnail(headline: string): string {
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const lines: string[] = [];
  let current = "";
  for (const word of headline.split(" ")) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > 14 && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);

  const shown = lines.slice(0, 5);
  if (lines.length > 5) shown[4] = shown[4] + "…";

  const startY = 600 - ((shown.length - 1) * 88) / 2;
  const tspans = shown
    .map((l, i) => `<tspan x="60" dy="${i === 0 ? 0 : 88}">${esc(l)}</tspan>`)
    .join("");

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 1280">` +
    `<rect width="720" height="1280" fill="#242937"/>` +
    `<rect x="60" y="${startY - 110}" width="96" height="10" rx="5" fill="#f5b942"/>` +
    `<text x="60" y="${startY}" fill="#e9eaf0" font-family="Arial, Helvetica, sans-serif" font-size="72" font-weight="700">${tspans}</text>` +
    `</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildMock(topic: string): GenerationResult {
  const clean = topic.trim().replace(/\s+/g, " ");
  const headline = clean.charAt(0).toUpperCase() + clean.slice(1);
  const words = keywordsFrom(clean);

  return {
    id: `mock-${Date.now()}`,
    topic: clean,
    videoUrl: SAMPLE_VIDEO,
    thumbnailUrl: makeThumbnail(headline),
    platforms: {
      youtube: {
        title: truncate(`${headline} in 30 seconds`, 100),
        description:
          `${headline}, explained in under a minute.\n\n` +
          `Watch to the end for the one detail most people miss.\n\n` +
          `Subscribe for a new short every day. #Shorts`,
        tags: [...words, "shorts", "explained", "quicktips"],
      },
      instagram: {
        title: truncate(`Save this: ${clean}`, 80),
        description:
          `${headline}. Here's the quick version.\n\n` +
          `Send this to someone who needs to hear it, and follow for more.`,
        tags: [...words, "reels", "explorepage", "learnsomethingnew"],
      },
      facebook: {
        title: truncate(headline, 80),
        description:
          `${headline}, in one minute or less.\n\n` +
          `Share this with a friend and tell us what you'd like us to cover next.`,
        tags: [...words, "reels", "facebookreels", "didyouknow"],
      },
    },
  };
}

class GenerationError extends Error {}

async function generateContent(topic: string): Promise<GenerationResult> {
  if (USE_MOCK) {
    await sleep(STAGE_MS * STAGES.length + 300);
    return buildMock(topic);
  }

  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic }),
  });

  if (res.status === 402) {
    throw new GenerationError("You're out of credits. View plans to keep generating.");
  }
  if (!res.ok) {
    throw new GenerationError(
      "We couldn't generate the video. Your credit was not used. Try again."
    );
  }
  return (await res.json()) as GenerationResult;
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function StudioPage() {
  const topicId = useId();
  const [topic, setTopic] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [stage, setStage] = useState(0);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [credits, setCredits] = useState(INITIAL_CREDITS);
  const [isPro, setIsPro] = useState(false);
  const [unlimited, setUnlimited] = useState(false); // Pro + CONFIG.proSkipsCredits
  const runRef = useRef(0);

  const generating = status === "generating";
  const trimmed = topic.trim();
  const outOfCredits = !unlimited && credits <= 0;
  const canGenerate = trimmed.length >= 3 && !generating && !outOfCredits;

  // Load the real balance and plan for the signed-in user.
  useEffect(() => {
    if (USE_MOCK) return;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        if (!me) return;
        setCredits(me.creditsLeft);
        setIsPro(me.isPro);
        setUnlimited(me.unlimited);
      })
      .catch(() => {}); // keep the defaults; the server still enforces credits
  }, []);

  // Advance the progress list while a job is running.
  useEffect(() => {
    if (!generating) return;
    const id = setInterval(
      () => setStage((s) => Math.min(s + 1, STAGES.length - 1)),
      STAGE_MS
    );
    return () => clearInterval(id);
  }, [generating]);

  async function handleGenerate() {
    if (!canGenerate) return;
    const run = ++runRef.current;
    setStatus("generating");
    setStage(0);
    setError(null);

    try {
      const data = await generateContent(trimmed);
      if (run !== runRef.current) return;
      setResult(data);
      setStatus("done");
      // Trust the server's balance (a Pro user may not be charged at all).
      setCredits((c) =>
        typeof data.creditsLeft === "number" ? data.creditsLeft : Math.max(0, c - 1)
      );
    } catch (e) {
      if (run !== runRef.current) return;
      setError(
        e instanceof GenerationError
          ? e.message
          : "Something went wrong. Check your connection and try again."
      );
      setStatus("error");
    }
  }

  return (
    <div className="min-h-dvh bg-base font-body text-ink">
      {/* Top bar (move into (dashboard)/layout.tsx later) */}
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="block h-5 w-[11px] rounded-[3px] bg-accent"
            />
            <span className="font-display text-lg font-semibold tracking-tight">
              {APP_NAME}
            </span>
          </div>
          <div className="flex items-center gap-2">
          <Link
            href="/billing"
            className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:text-ink"
          >
            <span
              aria-hidden
              className={cx(
                "h-2 w-2 rounded-full",
                outOfCredits ? "bg-danger" : "bg-accent"
              )}
            />
            <span>
              {unlimited ? (
                <span className="font-medium text-ink">Unlimited</span>
              ) : (
                <>
                  <span className="font-medium text-ink tabular-nums">{credits}</span>{" "}
                  {credits === 1 ? "credit" : "credits"} left
                </>
              )}
            </span>
            {isPro && (
              <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-ink">
                Pro
              </span>
            )}
          </Link>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:text-ink"
            >
              Sign out
            </button>
          </form>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-x-12 gap-y-10 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_30rem] lg:py-12">
        {/* ------------------------------ Composer ----------------------------- */}
        <section
          aria-labelledby="composer-title"
          className="lg:col-start-1 lg:row-start-1"
        >
          <h1
            id="composer-title"
            className="font-display text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            What's your video about?
          </h1>
          <p className="mt-2 max-w-prose text-muted">
            Describe a topic. We write the script, record the voiceover, render the
            video, and prepare the post copy for each platform.
          </p>

          <div className="mt-6 rounded-2xl border border-line bg-surface p-4 transition-colors focus-within:border-accent/60 focus-within:ring-1 focus-within:ring-accent/60">
            <label htmlFor={topicId} className="sr-only">
              Video topic
            </label>
            <textarea
              id={topicId}
              rows={4}
              value={topic}
              maxLength={MAX_TOPIC}
              disabled={generating}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  void handleGenerate();
                }
              }}
              placeholder="e.g. 5 habits that help you sleep better"
              className="w-full resize-none bg-transparent text-lg leading-relaxed text-ink outline-none placeholder:text-muted/70 disabled:opacity-60"
            />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
              <p className="text-xs text-muted">
                <span className="tabular-nums">
                  {topic.length}/{MAX_TOPIC}
                </span>
                <span className="ml-3 hidden sm:inline">Ctrl/⌘ + Enter to generate</span>
              </p>

              <div className="flex items-center gap-3">
                {!unlimited && <span className="text-xs text-muted">Uses 1 credit</span>}
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  aria-busy={generating}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 font-medium text-accent-ink transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
                >
                  {generating ? (
                    <Loader2
                      className="h-4 w-4 motion-safe:animate-spin"
                      aria-hidden
                    />
                  ) : (
                    <Sparkles className="h-4 w-4" aria-hidden />
                  )}
                  {generating ? "Generating…" : "Generate video"}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">Try:</span>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={generating}
                onClick={() => setTopic(s)}
                className="rounded-full border border-line px-3 py-1 text-sm text-muted transition-colors hover:border-muted hover:text-ink disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>

          {(error || outOfCredits) && !generating && (
            <div
              role="alert"
              className="mt-5 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm"
            >
              {error ?? "You're out of credits."}{" "}
              <Link href="/billing" className="font-medium underline underline-offset-2">
                View plans
              </Link>
            </div>
          )}
        </section>

        {/* ------------------------------ Preview ------------------------------ */}
        <section
          aria-label="Preview"
          className="lg:sticky lg:top-8 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start"
        >
          <PreviewStage status={status} stage={stage} result={result} />
        </section>

        {/* ------------------------------ Post copy ---------------------------- */}
        <section
          aria-labelledby="copy-title"
          className="lg:col-start-1 lg:row-start-2"
        >
          <h2
            id="copy-title"
            className="font-display text-xl font-semibold tracking-tight"
          >
            Post copy
          </h2>
          <p className="mt-1 text-sm text-muted">
            Titles, descriptions, and tags written for each platform.
          </p>
          <PostCopy result={result} loading={generating} />
        </section>
      </main>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Preview: video + thumbnail                                                */
/* -------------------------------------------------------------------------- */

function PreviewStage({
  status,
  stage,
  result,
}: {
  status: Status;
  stage: number;
  result: GenerationResult | null;
}) {
  const generating = status === "generating";

  return (
    <div className="grid grid-cols-[1.6fr_1fr] items-start gap-4 sm:gap-6">
      <figure className="min-w-0">
        <figcaption className="mb-2 flex h-7 items-center justify-between gap-2 text-sm text-muted">
          <span>Video</span>
          {result && !generating && (
            <a
              href={downloadHref(result, "video")}
              download
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs transition-colors hover:text-ink"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              Download
            </a>
          )}
        </figcaption>
        {/* The bezel is the one distinctive element on the page. */}
        <div className="rounded-[2rem] border border-line bg-raised p-1.5">
          <div className="relative aspect-[9/16] overflow-hidden rounded-[1.5rem] bg-base">
            {generating ? (
              <GeneratingView stage={stage} />
            ) : result ? (
              <VideoPlayer
                key={result.id}
                src={result.videoUrl}
                poster={result.thumbnailUrl}
              />
            ) : (
              <EmptyFrame
                icon={<Film className="h-6 w-6" aria-hidden />}
                text="Your video appears here"
              />
            )}
          </div>
        </div>
      </figure>

      <figure className="min-w-0">
        <figcaption className="mb-2 flex h-7 items-center justify-between gap-2 text-sm text-muted">
          <span>Thumbnail</span>
          {result && !generating && (
            <a
              href={downloadHref(result, "thumbnail")}
              download
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs transition-colors hover:text-ink"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              Download
            </a>
          )}
        </figcaption>
        <div className="relative aspect-[9/16] overflow-hidden rounded-2xl border border-line bg-surface">
          {generating ? (
            <div
              aria-hidden
              className="h-full w-full bg-raised motion-safe:animate-pulse"
            />
          ) : result ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={result.thumbnailUrl}
              alt={`Generated thumbnail for "${result.topic}"`}
              className="h-full w-full object-cover"
            />
          ) : (
            <EmptyFrame
              icon={<ImageIcon className="h-5 w-5" aria-hidden />}
              text="Thumbnail appears here"
            />
          )}
        </div>
      </figure>
    </div>
  );
}

function EmptyFrame({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted">
      {icon}
      <span>{text}</span>
    </div>
  );
}

function GeneratingView({ stage }: { stage: number }) {
  return (
    <div className="flex h-full flex-col justify-end gap-3 p-4">
      <p role="status" className="sr-only">
        {STAGES[stage]}
      </p>
      <p className="font-display text-base font-medium">Making your video</p>
      <ol className="space-y-2" aria-hidden>
        {STAGES.map((label, i) => {
          const done = i < stage;
          const active = i === stage;
          return (
            <li
              key={label}
              className={cx(
                "flex items-start gap-2 text-[13px] leading-tight",
                done && "text-muted",
                active && "text-ink",
                !done && !active && "text-muted/60"
              )}
            >
              <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center">
                {done ? (
                  <Check className="h-4 w-4 text-accent" />
                ) : active ? (
                  <Loader2 className="h-4 w-4 text-accent motion-safe:animate-spin" />
                ) : (
                  <span className="h-2 w-2 rounded-full border border-muted/60" />
                )}
              </span>
              {label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Vertical video player                                                     */
/* -------------------------------------------------------------------------- */

function VideoPlayer({ src, poster }: { src: string; poster: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Autoplay (muted) unless the person prefers reduced motion.
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    v.play().catch(() => {});
  }, [src]);

  useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted]);

  function toggle() {
    const v = ref.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }

  return (
    <div className="group relative h-full w-full">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={ref}
        src={src}
        poster={poster}
        loop
        muted
        playsInline
        preload="metadata"
        onClick={toggle}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        className="h-full w-full cursor-pointer object-cover"
      />

      {/* Scrim keeps the controls legible over any footage. */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pb-3 pt-10">
        <input
          type="range"
          aria-label="Seek"
          min={0}
          max={duration || 0}
          step={0.01}
          value={Math.min(time, duration || 0)}
          onChange={(e) => {
            const t = Number(e.target.value);
            if (ref.current) ref.current.currentTime = t;
            setTime(t);
          }}
          className="h-1 w-full cursor-pointer accent-accent"
        />
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggle}
              aria-label={playing ? "Pause video" : "Play video"}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
            >
              {playing ? (
                <Pause className="h-4 w-4" aria-hidden />
              ) : (
                <Play className="h-4 w-4" aria-hidden />
              )}
            </button>
            <span className="text-xs tabular-nums text-white/85">
              {formatTime(time)} / {formatTime(duration)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? "Unmute video" : "Mute video"}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
          >
            {muted ? (
              <VolumeX className="h-4 w-4" aria-hidden />
            ) : (
              <Volume2 className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Post copy tabs                                                            */
/* -------------------------------------------------------------------------- */

function PostCopy({
  result,
  loading,
}: {
  result: GenerationResult | null;
  loading: boolean;
}) {
  const [active, setActive] = useState<PlatformKey>("youtube");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const baseId = useId();

  const platform = PLATFORMS.find((p) => p.key === active)!;
  const copy = result?.platforms[active];

  function onKeyDown(e: React.KeyboardEvent, i: number) {
    const n = PLATFORMS.length;
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % n;
    else if (e.key === "ArrowLeft") next = (i - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else return;
    e.preventDefault();
    setActive(PLATFORMS[next].key);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="mt-5">
      <div
        role="tablist"
        aria-label="Platform"
        className="flex overflow-x-auto border-b border-line"
      >
        {PLATFORMS.map((p, i) => {
          const selected = p.key === active;
          return (
            <button
              key={p.key}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              id={`${baseId}-tab-${p.key}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${p.key}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(p.key)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cx(
                "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                selected
                  ? "border-accent text-ink"
                  : "border-transparent text-muted hover:text-ink"
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-panel-${active}`}
        aria-labelledby={`${baseId}-tab-${active}`}
        className="pt-5"
      >
        {loading ? (
          <div aria-hidden className="space-y-3 motion-safe:animate-pulse">
            <div className="h-14 rounded-xl bg-surface" />
            <div className="h-32 rounded-xl bg-surface" />
            <div className="h-14 rounded-xl bg-surface" />
          </div>
        ) : !copy ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
            Generate a video to get {platform.label} copy you can paste straight in.
          </p>
        ) : (
          // key remounts the copy buttons so "Copied" resets when switching tabs
          <div key={active}>
            <div className="mb-3 flex justify-end">
              <CopyButton
                idleText="Copy all"
                label={`all ${platform.label} post copy`}
                text={`${copy.title}\n\n${copy.description}\n\n${formatTags(
                  copy.tags,
                  platform.tagStyle
                )}`}
              />
            </div>

            <div className="divide-y divide-line rounded-xl border border-line bg-surface">
              <Field label="Title" copyText={copy.title}>
                <p className="text-ink">{copy.title}</p>
              </Field>

              <Field label="Description" copyText={copy.description}>
                <p className="whitespace-pre-line leading-relaxed text-ink">
                  {copy.description}
                </p>
              </Field>

              <Field
                label="Tags"
                copyText={formatTags(copy.tags, platform.tagStyle)}
              >
                <ul className="flex flex-wrap gap-1.5">
                  {copy.tags.map((t) => (
                    <li
                      key={t}
                      className="rounded-md bg-raised px-2 py-1 text-sm text-ink"
                    >
                      {platform.tagStyle === "hashtag" ? `#${t}` : t}
                    </li>
                  ))}
                </ul>
              </Field>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  copyText,
  children,
}: {
  label: string;
  copyText: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-muted">{label}</h3>
        <CopyButton label={label.toLowerCase()} text={copyText} />
      </div>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Copy button                                                               */
/* -------------------------------------------------------------------------- */

function CopyButton({
  text,
  label,
  idleText = "Copy",
}: {
  text: string;
  label: string;
  idleText?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    []
  );

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for non-secure contexts or blocked clipboard permission.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={`Copy ${label}`}
        className={cx(
          "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
          copied
            ? "border-accent/50 text-accent"
            : "border-line text-muted hover:border-muted hover:text-ink"
        )}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden />
        )}
        {copied ? "Copied" : idleText}
      </button>
      <span role="status" className="sr-only">
        {copied ? `Copied ${label}` : ""}
      </span>
    </>
  );
}
