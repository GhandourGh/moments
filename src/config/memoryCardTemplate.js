import { getEventContent } from '@/state/eventContent.js';

/** Portrait keepsake — 2:3, sized for phone saves and prints. */
export const MEMORY_CARD_EXPORT = {
  width: 1200,
  height: 1800,
  photoAspect: 4 / 5,
};

const W = MEMORY_CARD_EXPORT.width;
const H = MEMORY_CARD_EXPORT.height;
const SIDE = 48;
const PHOTO_RADIUS = 18;
const PHOTO_GAP = 32;

/** Filename for branded keepsake download. */
export function memoryCardDownloadName(shotId) {
  const content = getEventContent();
  const mark = content.initials?.replace(/\s+/g, "") || "Moment";
  const slug = (content.dateDisplay || "tonight").replace(/\s*\.\s*/g, "").replace(/\s+/g, "");
  const id = shotId ? `-${String(shotId).slice(0, 12)}` : "";
  return `${mark}-${slug}${id}.jpg`;
}

/** Filename for plain photo download. */
export function plainPhotoDownloadName(shotId) {
  const id = shotId ? String(shotId).slice(0, 20) : "photo";
  return `moment-${id}.jpg`;
}

/**
 * Save a blob straight to the device (anchor download).
 * Share is handled separately in the lightbox — this always downloads.
 */
export async function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}

/** Fetch a gallery asset as a blob (same-origin or signed URL). */
export async function fetchAssetBlob(src) {
  if (!src) throw new Error("No URL");
  const res = await fetch(src, {
    credentials: src.startsWith("/") ? "include" : "omit",
  });
  if (!res.ok) throw new Error(`Could not fetch (${res.status})`);
  return res.blob();
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image for keepsake card"));
    img.decoding = "async";
    if (!src.startsWith("blob:") && !src.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    img.src = src;
  });
}

/** Same-origin URL for canvas export — avoids Supabase CORS tainting. */
export function photoExportUrl(eventSlug, photoId) {
  if (!eventSlug || !photoId) return "";
  return `/api/events/${encodeURIComponent(eventSlug)}/photos/${encodeURIComponent(photoId)}?asset=raw`;
}

/** Fetch cross-origin gallery URLs as blobs so canvas export is not tainted. */
async function loadImageForExport(src) {
  if (!src) throw new Error("No image URL");
  if (src.startsWith("blob:") || src.startsWith("data:")) {
    return loadImageElement(src);
  }

  const res = await fetch(src, {
    credentials: src.startsWith("/") ? "include" : "omit",
  });
  if (!res.ok) throw new Error(`Could not fetch image (${res.status})`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await loadImageElement(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function ensureFonts() {
  if (document.fonts?.load) {
    await Promise.all([
      document.fonts.load('500 56px "Cormorant Garamond"'),
      document.fonts.load('600 24px "Source Sans 3"'),
    ]).catch(() => {});
  }
  await document.fonts?.ready;
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

function drawCover(ctx, img, x, y, w, h) {
  const ir = img.width / img.height;
  const rr = w / h;
  let sw;
  let sh;
  let sx;
  let sy;
  if (ir > rr) {
    sh = img.height;
    sw = sh * rr;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / rr;
    sx = 0;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function layoutCard() {
  const photoW = W - SIDE * 2;
  const photoH = photoW * (5 / 4);
  const photoX = SIDE;
  const photoY = SIDE;
  const footTop = photoY + photoH + PHOTO_GAP;
  return { photoX, photoY, photoW, photoH, footTop };
}

/**
 * Rasterize the memory card frame + photo to a JPEG Blob (matches MemoryCard export layout).
 */
export async function composeMemoryCardBlob(imageUrl) {
  await ensureFonts();
  const img = await loadImageForExport(imageUrl);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  const { photoX, photoY, photoW, photoH, footTop } = layoutCard();
  const cx = W / 2;
  const { initials, dateDisplay } = getEventContent();

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#fffefb");
  bg.addColorStop(1, "#f7f2e8");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.shadowColor = "rgba(28, 26, 23, 0.14)";
  ctx.shadowBlur = 48;
  ctx.shadowOffsetY = 16;
  roundRectPath(ctx, photoX, photoY, photoW, photoH, PHOTO_RADIUS);
  ctx.fillStyle = "#ebe6dc";
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRectPath(ctx, photoX, photoY, photoW, photoH, PHOTO_RADIUS);
  ctx.clip();
  drawCover(ctx, img, photoX, photoY, photoW, photoH);
  ctx.restore();

  ctx.strokeStyle = "rgba(0, 0, 0, 0.08)";
  ctx.lineWidth = 2;
  roundRectPath(ctx, photoX + 1, photoY + 1, photoW - 2, photoH - 2, PHOTO_RADIUS - 1);
  ctx.stroke();

  ctx.fillStyle = "#b48a4a";
  ctx.globalAlpha = 0.7;
  ctx.fillRect(cx - 32, footTop, 64, 2);
  ctx.globalAlpha = 1;

  if (initials?.trim()) {
    ctx.fillStyle = "#1c1a17";
    ctx.font = '500 56px "Cormorant Garamond", Georgia, serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(initials, cx, footTop + 64);
  }

  if (dateDisplay?.trim()) {
    ctx.font = '600 24px "Source Sans 3", system-ui, sans-serif';
    ctx.fillStyle = "#524c44";
    ctx.fillText(
      dateDisplay.toUpperCase(),
      cx,
      footTop + (initials?.trim() ? 108 : 64),
    );
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Export failed"))),
      "image/jpeg",
      0.93,
    );
  });
}
