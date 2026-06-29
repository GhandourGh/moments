import { useCallback, useEffect, useState } from "react";

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true
  );
}

export function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** True when iOS Safari (not Chrome, Firefox, etc. on iPhone). */
export function isIOSSafari() {
  if (!isIOS()) return false;
  const ua = navigator.userAgent;
  return /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(ua);
}

export function isIOSNonSafari() {
  return isIOS() && !isIOSSafari();
}

export function isAndroid() {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

export function isMobileBrowser() {
  return isIOS() || isAndroid();
}

/**
 * PWA install state — Android uses beforeinstallprompt; iOS uses manual steps.
 */
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const mq = window.matchMedia("(display-mode: standalone)");
    const sync = () => setInstalled(isStandalone());
    mq.addEventListener("change", sync);
    window.addEventListener("appinstalled", sync);
    return () => {
      mq.removeEventListener("change", sync);
      window.removeEventListener("appinstalled", sync);
    };
  }, []);

  useEffect(() => {
    function onBeforeInstall(e) {
      e.preventDefault();
      setDeferredPrompt(e);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  const installAndroid = useCallback(async () => {
    if (!deferredPrompt) return "unavailable";
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return outcome;
  }, [deferredPrompt]);

  const canShow = !installed && isMobileBrowser();
  const platform = isIOS() ? "ios" : isAndroid() ? "android" : "other";
  const iosNeedsSafari = isIOSNonSafari();
  const iosSafari = isIOSSafari();

  return {
    canShow,
    installed,
    platform,
    iosNeedsSafari,
    iosSafari,
    isAndroidInstallable: !!deferredPrompt,
    installAndroid,
  };
}
