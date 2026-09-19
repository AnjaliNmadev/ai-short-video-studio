/**
 * src/lib/storage.ts
 *
 * Upload finished files to Supabase Storage (bucket created by storage.sql).
 * Files are written with the service-role key, so no client can upload.
 */
import "server-only";
import { CONFIG } from "@/config/generation";
import { getAdminClient } from "@/lib/supabase/admin";

/** Uploads a file and returns its public URL. */
export async function uploadPublic(
  path: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  const storage = getAdminClient().storage.from(CONFIG.storageBucket);

  const { error } = await storage.upload(path, body, {
    contentType,
    upsert: false,
    cacheControl: "31536000", // files are immutable (new generation = new path)
  });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  return storage.getPublicUrl(path).data.publicUrl;
}

/** Best-effort cleanup. Never throws. */
export async function removeFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await getAdminClient().storage.from(CONFIG.storageBucket).remove(paths);
  } catch (err) {
    console.error("[storage] cleanup failed", paths, err);
  }
}
