import { COUPLE } from '@/config/couple.js';

/** Offscreen render target — used when compositing branded downloads. */
export const MEMORY_CARD_EXPORT = {
  width: 1200,
  height: 1500,
  photoAspect: 4 / 5,
};

const W = MEMORY_CARD_EXPORT.width;
const H = MEMORY_CARD_EXPORT.height;
const PAD_X = 36;
const PAD_TOP = 36;
const PAD_BOTTOM = 48;
const FOOT_H = 148;

/** Filename for branded keepsake download. */
export function memoryCardDownloadName(shotId) {
  const slug = COUPLE.date.replace(/\s*\.\s*/g, "").replace(/\s+/g, "");
  const id = shotId ? `-${String(shotId).slice(0, 12)}` : "";
  return `${COUPLE.initials.replace(/\s+/g, "")}-${slug}${id}.jpg`;
}

/** Filename for plain photo download. */
export function plainPhotoDownloadName(shotId) {
  const id = shotId ? String(shotId).slice(0, 20) : "photo";
  return `moment-${id}.jpg`;
}

export function triggerDownload(blob, filename) {
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

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image for keepsake card"));
    img.src = src;
  });
}

async function ensureFonts() {
  if (document.fonts?.load) {
    await Promise.all([
      document.fonts.load('500 52px "Cormorant Garamond"'),
      document.fonts.load('600 22px "Source Sans 3"'),
      document.fonts.load('600 18px "Source Sans 3"'),
    ]).catch(() => {});
  }
  await document.fonts?.ready;
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

/**
 * Rasterize the memory card frame + photo to a JPEG Blob (matches MemoryCard export layout).
 */
export async function composeMemoryCardBlob(imageUrl) {
  await ensureFonts();
  const img = await loadImage(imageUrl);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  const innerW = W - PAD_X * 2;
  let photoW = innerW;
  let photoH = photoW * (5 / 4);
  const maxPhotoH = H - PAD_TOP - PAD_BOTTOM - FOOT_H;
  if (photoH > maxPhotoH) {
    photoH = maxPhotoH;
    photoW = photoH * (4 / 5);
  }
  const photoX = (W - photoW) / 2;
  const photoY = PAD_TOP;

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#fffefb");
  bg.addColorStop(1, "#faf6ee");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(180, 138, 74, 0.22)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  ctx.save();
  ctx.beginPath();
  ctx.rect(photoX, photoY, photoW, photoH);
  ctx.clip();
  drawCover(ctx, img, photoX, photoY, photoW, photoH);
  ctx.restore();

  ctx.strokeStyle = "rgba(28, 26, 23, 0.06)";
  ctx.lineWidth = 2;
  ctx.strokeRect(photoX, photoY, photoW, photoH);

  const footTop = photoY + photoH + 28;
  const cx = W / 2;

  ctx.fillStyle = "#b48a4a";
  ctx.globalAlpha = 0.65;
  ctx.fillRect(cx - 28, footTop, 56, 1);
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#1c1a17";
  ctx.font = '500 52px "Cormorant Garamond", Georgia, serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.letterSpacing = "0.16em";
  ctx.fillText(COUPLE.initials, cx, footTop + 58);

  ctx.font = '600 22px "Source Sans 3", system-ui, sans-serif';
  ctx.fillStyle = "#524c44";
  ctx.letterSpacing = "0.28em";
  ctx.fillText(COUPLE.date.toUpperCase(), cx, footTop + 96);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Export failed"))),
      "image/jpeg",
      0.92,
    );
  });
}
