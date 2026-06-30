import { isStandalone } from "../hooks/useInstallPrompt.js";

/** True when running inside a Capacitor native WebView shell. */
export function isCapacitorNative() {
  if (typeof window === "undefined") return false;
  return Boolean(window.Capacitor?.isNativePlatform?.());
}

/** Guests who installed via A2HS (standalone display mode). */
export function isA2HSInstalled() {
  return isStandalone();
}

/** Prefer native sensor capture when a Capacitor shell is present. */
export function shouldPreferNativeCamera() {
  return isCapacitorNative();
}
