const LUMA_SAMPLE_SIZE = 32;

let sampleCanvas = null;
let sampleCtx = null;

function getLumaSampler() {
  if (!sampleCanvas) {
    sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = LUMA_SAMPLE_SIZE;
    sampleCanvas.height = LUMA_SAMPLE_SIZE;
    sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
  }
  return sampleCtx;
}

/** Sample mean luma (0–255) of a video frame for AUTO flash heuristics. */
export function meanLumaOf(video) {
  if (!video?.videoWidth) return 255;
  const ctx = getLumaSampler();
  ctx.drawImage(video, 0, 0, LUMA_SAMPLE_SIZE, LUMA_SAMPLE_SIZE);
  const data = ctx.getImageData(0, 0, LUMA_SAMPLE_SIZE, LUMA_SAMPLE_SIZE).data;
  let sum = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return sum / n;
}
