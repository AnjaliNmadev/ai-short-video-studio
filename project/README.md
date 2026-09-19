# AI Short Video & Content Studio

A Next.js app that turns a topic into a short vertical video (script → voiceover →
AI video clips → assembled MP4 + thumbnail), with Supabase auth, a credit system,
and a Pro plan that removes the watermark.

This zip merges everything you had split across parts 1–4 into one project, plus
the config files (`package.json`, `tsconfig.json`, `next.config.ts`,
`postcss.config.mjs`, `.env.local.example`) that weren't in any of the parts.

## Providers picked for lowest cost

- **Script generation:** Google **Gemini** (was Anthropic's Claude API) — Gemini has a genuine ongoing free tier on Google AI Studio; Anthropic's API only gives a one-time trial credit that expires.
- **Video clips + thumbnail:** **Replicate** (was fal.ai) — chosen because the code already anticipated this swap, and it hosts many video models under one account. There is no provider anywhere with a recurring free tier for AI video generation (it's genuinely expensive compute) — Replicate's new-account trial credit is the cheapest way to start.
- **Voiceover:** kept **ElevenLabs** — it already has a small, real, ongoing free tier.
- **Database/auth:** kept **Supabase** — genuine ongoing free tier.

## One fix made while merging

`supabase/part4.sql` originally redefined `handle_new_user()` with
`create or replace function`. Since `schema.sql` defines a function of the same
name that also inserts into `public.users` (which `generations.user_id` has a
foreign key to), running part4.sql's original version *after* schema.sql would
have silently overwritten it with a version that only inserts into
`public.credits` — breaking video generation for anyone who signs up after
that point. That redefinition has been removed from `part4.sql`; only its safe
backfill query remains. Run schema.sql first and this is a non-issue.

## Setup

1. **Install:**
   ```bash
   npm install
   ```

2. **Env:** copy `.env.local.example` to `.env.local` and fill in:
   - Supabase URL / anon key / service-role key (Project Settings → API) — free tier
   - `GEMINI_API_KEY` (script generation — get one free at [aistudio.google.com](https://aistudio.google.com/apikey); this has a genuine ongoing free tier, unlike a one-time trial credit)
   - `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` (voiceover — free tier gives a limited number of characters/month)
   - `REPLICATE_API_TOKEN` (+ optional `REPLICATE_VIDEO_MODEL` / `REPLICATE_IMAGE_MODEL`) (video clips + thumbnail — new accounts get a small trial credit; there is no recurring free tier for AI video generation anywhere, since it's compute-heavy)
   - Leave `BILLING_MODE=mock` for local testing

   **Note on cost:** Supabase, Gemini's free tier, and ElevenLabs' free tier can realistically run your app at zero cost while traffic is low. Replicate is the one piece that will cost money once your trial credit runs out — there's no way around this for real AI video generation on any provider.

3. **Supabase SQL — run in this exact order** (Dashboard → SQL Editor):
   1. `supabase/schema.sql` — creates `users`, `credits`, `generations`,
      `consume_credits`/`refund_credits`, and the signup trigger.
   2. `supabase/storage.sql` — creates the public storage bucket.
   3. `supabase/part4.sql` — adds `payments`, `activate_pro`/`deactivate_pro`,
      the private clean-video bucket, and backfills any pre-existing users.

4. **Google sign-in (optional):** Google Cloud Console → OAuth client (Web).
   Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
   Paste the client ID/secret into Supabase → Authentication → Providers → Google.

5. **Supabase → Authentication → URL Configuration:** set Site URL to your app's
   URL, and add `http://localhost:3000/**` (and your prod URL) to Redirect URLs —
   the wildcard matters, since the login flow appends `?next=...`.

6. Optional, for cross-device email confirmation: set the "Confirm signup"
   template link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.

7. **Run it:**
   ```bash
   npm run dev
   ```
   Visit `http://localhost:3000` — it redirects to `/create`. `USE_MOCK = true`
   in `src/app/(dashboard)/create/page.tsx` means the UI works with sample data
   even before your keys are set up.

8. Once your keys are in, set `USE_MOCK = false` in that same file to call the
   real `/api/generate`.

## Test it

1. Sign up → `/create` shows 5 credits. Generate → 4 (and back to 5 if generation fails).
2. Download the video: it has the logo.
3. `/billing` → Upgrade. Header shows **Pro**, credits +100.
4. Download the same video again: **no logo**. New generations are logo-free.

## Behaviour to know

- **Credits:** `/api/generate` charges atomically before work starts and refunds on failure.
- **Videos made before the Pro update** have no clean master, so Pro users get the watermarked file for those.
- **Videos made while Pro** are logo-free in the public bucket, and stay so after a cancellation.
- The dashboard preview of a Free-plan video keeps its logo after upgrading; only downloads switch.
- Free-plan generation runs one extra ffmpeg pass (logo overlay) — expect a few seconds more.
- To stop people farming free credits with throwaway addresses, keep "Confirm email" on in Supabase.
- `ffmpeg`/`sharp` need a Node host that allows spawning processes (Docker, Railway, Render, Fly, a VPS) — plain serverless functions often can't run this pipeline.
- `src/middleware.ts` is the Next.js 14/15 name for the session-refresh file (the code itself notes it becomes `proxy.ts` with an exported `proxy()` function on Next.js 16+).
