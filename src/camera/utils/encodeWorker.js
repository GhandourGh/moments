/** OffscreenCanvas JPEG encode — runs off the main thread. */

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

function fitDims(srcW, srcH, maxEdge) {
  const long = Math.max(srcW, srcH);
  if (long <= maxEdge) return { w: srcW, h: srcH };
  const scale = maxEdge / long;
  return { w: Math.round(srcW * scale), h: Math.round(srcH * scale) };
}

self.onmessage = async (e) => {
  const { id, bitmap, maxEdge = MAX_EDGE, quality = JPEG_QUALITY } = e.data;
  try {
    const { w, h } = fitDims(bitmap.width, bitmap.height, maxEdge);
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
    const buffer = await blob.arrayBuffer();
    self.postMessage({ id, ok: true, buffer }, [buffer]);
  } catch (err) {
    bitmap.close?.();
    self.postMessage({ id, ok: false, error: String(err) });
  }
};
