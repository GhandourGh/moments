import { shouldPreferNativeCamera } from "../detectNativeShell.js";
import { createNativeCameraAdapter } from "./NativeCameraAdapter.js";
import { createWebCameraAdapter } from "./WebCameraAdapter.js";

/**
 * Select camera backend: native Capacitor when available, else web PWA.
 * CameraView still uses the web pipeline today; this factory is the
 * integration point for a future native bridge without UI rewrites.
 */
export function createCameraAdapter() {
  if (shouldPreferNativeCamera()) {
    const native = createNativeCameraAdapter();
    if (native) return native;
  }
  return createWebCameraAdapter();
}

export function getActiveCameraBackendId() {
  return createCameraAdapter().id;
}
