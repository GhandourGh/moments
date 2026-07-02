/**
 * On-device photo moderation — free ($0/event), no API key.
 *
 * Runs the NSFWJS MobileNetV2-mid graph model (~4.3 MB from /models/nsfw,
 * lazy-loaded) on the TensorFlow runtime already bundled inside
 * @vladmandic/face-api, so it adds no new JS to the bundle. Blocked photos
 * never leave the device. This is the free tier of the moderation story:
 * when ANTHROPIC_API_KEY is set on the server, api/events/[id]/photos.ts
 * ALSO screens uploads with Claude — that path is authoritative, this one
 * is a courtesy filter.
 *
 * Best-effort: any load/classify failure returns { allowed: true } — a
 * broken model must never eat wedding photos.
 */

// Fixed output order of the NSFWJS models.
const CLASSES = ["drawing", "hentai", "neutral", "porn", "sexy"];

const BLOCK_THRESHOLDS = {
  porn: 0.75,
  hentai: 0.8,
};

let loadPromise = null;

async function ensureModel() {
  if (!loadPromise) {
    loadPromise = (async () => {
      const { tf } = await import("@vladmandic/face-api");
      const model = await tf.loadGraphModel("/models/nsfw/model.json");
      return { tf, model };
    })().catch((err) => {
      loadPromise = null; // retry on next call
      throw err;
    });
  }
  return loadPromise;
}

/** Kick off the model download early. */
export function warmup() {
  ensureModel().catch(() => {});
}

function softmax(values) {
  const max = Math.max(...values);
  const exps = values.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/** Classify a photo blob. Returns { allowed, reasons }. */
export async function moderatePhotoLocal(blob) {
  try {
    const { tf, model } = await ensureModel();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = 224;
    canvas.height = 224;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, 224, 224);
    bitmap.close();

    const output = tf.tidy(() => {
      const img = tf.browser.fromPixels(canvas).toFloat().div(tf.scalar(255)).expandDims(0);
      return model.predict(img);
    });
    const raw = Array.from(await output.data());
    output.dispose();

    // Graph exports may emit logits or probabilities — normalise if needed.
    const sum = raw.reduce((a, b) => a + b, 0);
    const probs = Math.abs(sum - 1) < 0.01 ? raw : softmax(raw);

    const reasons = CLASSES.filter(
      (name, i) => (BLOCK_THRESHOLDS[name] ?? Infinity) <= probs[i]
    );
    return { allowed: reasons.length === 0, reasons };
  } catch {
    return { allowed: true, reasons: [] };
  }
}
