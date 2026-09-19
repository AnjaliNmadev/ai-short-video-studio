/**
 * src/lib/storage-clean.ts
 *
 * The PRIVATE bucket (CONFIG.cleanStorageBucket) holds the logo-free master of
 * every file a Free user generated. It has no public URL and no client policies:
 * only the server can write to it, and files leave it only as short-lived signed
 * URLs handed out by /api/download/[id] to Pro users.
 */
import "server-only";
import { CONFIG } from "@/config/generation";
import { getAdminClient } from "@/lib/supabase/admin";

const bucket = () => getAdminClient().storage.from(CONFIG.cleanStorageBucket);

export async function uploadClean(
  path: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  const { error } = await bucket().upload(path, body, { contentType, upsert: false });
  if (error) throw new Error(`Clean upload failed: ${error.message}`);
}

/** Best-effort cleanup. Never throws. */
export async function removeCleanFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await bucket().remove(paths);
  } catch (err) {
    console.error("[storage-clean] cleanup failed", paths, err);
  }
}

/**
 * A URL that expires in `expiresInSec` and downloads the file as `filename`
 * (Supabase sets Content-Disposition: attachment). Returns null if the object
 * is missing.
 */
export async function signCleanDownload(
  path: string,
  filename: string,
  expiresInSec = 60
): Promise<string | null> {
  const { data, error } = await bucket().createSignedUrl(path, expiresInSec, {
    download: filename,
  });
  if (error || !data) return null;
  return data.signedUrl;
}
