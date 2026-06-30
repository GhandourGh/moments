import { isCapacitorNative } from "../detectNativeShell.js";

/**
 * Native camera backend (Capacitor shell) — sensor-direct still capture.
 *
 * Evaluation summary (see docs/NATIVE_CAMERA_EVALUATION.md):
 * - Recommended plugin stack: @capacitor/core + @capacitor/camera for
 *   one-shot picks; @capacitor-community/camera-preview or a custom
 *   CameraX/AVFoundation plugin for live preview parity with CameraView.
 * - A2HS-installed PWAs remain browser-hosted; native capture requires
 *   shipping a Capacitor IPA/AAB (or Android TWA) — not automatic with
 *   Add to Home Screen alone.
 * - Rollout: gate on Capacitor.isNativePlatform(); fall back to web adapter.
 */
export const NATIVE_CAMERA_ADAPTER = {
  id: "native",
  label: "Capacitor native camera",
  supportsLivePreview: false, // until camera-preview plugin is integrated
  supportsHardwareZoom: true,
  supportsTorch: true,
  supportsBurst: true,
  supportsVideo: true,
  maxStillResolution: "sensor-native (12MP+)",
};

export function isNativeCameraAvailable() {
  return isCapacitorNative();
}

/** Placeholder — wire to Capacitor Camera / CameraPreview when shell ships. */
export function createNativeCameraAdapter() {
  if (!isNativeCameraAvailable()) return null;
  return {
    ...NATIVE_CAMERA_ADAPTER,
    async takePhoto() {
      throw new Error(
        "Native camera not wired yet — integrate @capacitor/camera or camera-preview"
      );
    },
  };
}
