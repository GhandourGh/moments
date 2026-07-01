import React, { useEffect, useState } from "react";

/**
 * Slim banner pinned below the navbar when the device drops offline.
 * Honest UI: tells guests their captures are saved locally and will
 * sync the moment Wi-Fi returns. Renders nothing when online.
 */
export default function OfflineBanner() {
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  useEffect(() => {
    function up() { setOnline(true); }
    function down() { setOnline(false); }
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  if (online) return null;
  return (
    <div className="offline-banner" role="status" aria-live="polite">
      You're offline — captures are saved here and will sync when you're back on.
    </div>
  );
}
