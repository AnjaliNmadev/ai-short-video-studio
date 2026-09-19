/**
 * src/lib/ai/voice.ts
 *
 * Step 2a: narration text → MP3 voiceover using the ElevenLabs REST API.
 * Docs: https://elevenlabs.io/docs/api-reference/text-to-speech/convert
 */
import "server-only";
import { withRetry } from "@/lib/utils/retry";

export async function synthesizeVoiceover(text: string): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID; // pick one in the ElevenLabs voice library
  if (!apiKey || !voiceId) {
    throw new Error("ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID must be set");
  }

  return withRetry(async () => {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true,
          },
        }),
        signal: AbortSignal.timeout(60_000),
      }
    );

    if (!res.ok) {
      // Logged on the server only; the client never sees provider error text.
      throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    return Buffer.from(await res.arrayBuffer());
  });
}
