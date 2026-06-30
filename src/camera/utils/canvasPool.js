/** Reusable 2D canvases keyed by dimensions — avoids per-capture alloc. */
const pool = new Map();

export function acquireCanvas(w, h) {
  const key = `${w}x${h}`;
  let canvas = pool.get(key);
  if (!canvas) {
    canvas = document.createElement("canvas");
    pool.set(key, canvas);
  }
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  return canvas;
}
