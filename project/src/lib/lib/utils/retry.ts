/**
 * src/lib/utils/retry.ts
 *
 * Retries a flaky async call (network blips, 429/5xx from AI providers)
 * with exponential backoff: 800 ms, 1.6 s, 3.2 s...
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { retries = 2, baseMs = 800 }: { retries?: number; baseMs?: number } = {}
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, baseMs * 2 ** attempt));
      attempt++;
    }
  }
}
