import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Example Capacitor config for a native shell around the guest PWA.
 * Copy to capacitor.config.ts after: npm i @capacitor/core @capacitor/cli
 * Then: npx cap init && npx cap add ios && npx cap add android
 *
 * See docs/NATIVE_CAMERA_EVALUATION.md for the full rollout plan.
 */
const config: CapacitorConfig = {
  appId: "com.facegather.guest",
  appName: "FaceGather",
  webDir: "dist",
  server: {
    // androidScheme: "https",
  },
  plugins: {
  },
};

export default config;
