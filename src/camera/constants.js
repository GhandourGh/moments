export const MAX_EDGE = 1600;
export const JPEG_QUALITY = 0.82;

export const VIDEO_MAX_MS = 60_000;
export const VIDEO_BITRATE = 2_500_000;
export const AUDIO_BITRATE = 96_000;
export const VIDEO_MIME_CANDIDATES = [
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export const TORCH_WINDOW_MS = 50;
export const RETINA_FADE_MS = 100;
export const RETINA_HOLD_MS = 200;
export const RETINA_CAPTURE_AT_MS = RETINA_FADE_MS + RETINA_HOLD_MS;
export const RETINA_TOTAL_MS = RETINA_CAPTURE_AT_MS + RETINA_FADE_MS;

export const PHOTO_FLASH_CYCLE = ["off", "on", "auto"];
export const VIDEO_FLASH_CYCLE = ["off", "on"];
export const AUTO_LUMA_THRESHOLD = 90;

export const VISIBLE_ZOOM_STEPS = [0.5, 1, 2];

/** Burst must wait for the slowest flash path (retina = 400ms). */
export const BURST_HOLD_MS = 380;
export const BURST_INTERVAL_MS = RETINA_TOTAL_MS + 50;

export const MODE_SWITCH_DEBOUNCE_MS = 500;
export const FOCUS_RING_MS = 500;
