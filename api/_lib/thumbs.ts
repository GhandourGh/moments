import sharp from "sharp";
import { admin } from "./supabase.js";

export const THUMB_WIDTH = 400;
const THUMB_QUALITY = 75;

export function thumbStorageKey(eventId: string, photoId: string): string {
  return `${eventId}/${photoId}_thumb.jpg`;
}

/** Resize to a small JPEG suitable for grid tiles (~15–40 KB). */
export async function generateThumbBuffer(source: Buffer): Promise<Buffer> {
  return sharp(source)
    .rotate()
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: THUMB_QUALITY, mozjpeg: true })
    .toBuffer();
}

/** Ensure a thumb object exists; generate from the original on first request. */
export async function ensureThumb(
  bucket: string,
  eventId: string,
  photoId: string,
  originalKey: string
): Promise<Buffer | null> {
  const key = thumbStorageKey(eventId, photoId);
  const storage = admin().storage.from(bucket);

  const { data: existing } = await storage.download(key);
  if (existing) return Buffer.from(await existing.arrayBuffer());

  const { data: original, error: dlErr } = await storage.download(originalKey);
  if (dlErr || !original) return null;

  const thumb = await generateThumbBuffer(Buffer.from(await original.arrayBuffer()));
  await storage.upload(key, thumb, { contentType: "image/jpeg", upsert: true }).catch(() => {});
  return thumb;
}
