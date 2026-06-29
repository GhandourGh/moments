/** True when running as an installed home-screen app. */
export function isStandalonePwa() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Open Instagram / WhatsApp without ERR_BLOCKED_BY_RESPONSE.
 * Embedded browsers and PWAs block these sites in new tabs; native app
 * URLs or same-window navigation work reliably.
 */
export function openExternal({ native, web }) {
  const mobile = isMobile();
  const url = mobile && native ? native : web;

  if (mobile && native) {
    window.location.href = native;
    return;
  }

  if (isStandalonePwa()) {
    window.location.href = web;
    return;
  }

  const tab = window.open(web, "_blank", "noopener,noreferrer");
  if (!tab) window.location.href = web;
}
