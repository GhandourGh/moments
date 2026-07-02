import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import Navbar from '@/components/layout/Navbar.jsx';
import BottomTabBar from '@/components/layout/BottomTabBar.jsx';
import Fab from '@/components/layout/Fab.jsx';
import CameraView from '@/features/camera/CameraView.jsx';
import WelcomeModal, { WELCOME_KEY } from '@/features/welcome/WelcomeModal.jsx';
import { getGuest, subscribeGuest } from '@/state/guest.js';
import AppFooter from '@/components/layout/AppFooter.jsx';
import ErrorBoundary from '@/components/layout/ErrorBoundary.jsx';
import OfflineBanner from '@/components/layout/OfflineBanner.jsx';
import { ToastProvider, useToast } from '@/components/ui/Toast.jsx';
import { PhotosProvider, usePhotos } from '@/state/PhotosContext.jsx';
import { subscribe, retry } from '@/services/storage/uploadQueue.js';

/**
 * Wraps every route. Holds the camera overlay state so any screen, FAB, or
 * bottom-bar capture button can launch it without prop-drilling.
 */
export default function Layout() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <PhotosProvider>
          <LayoutInner />
        </PhotosProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

// Soft, warmer alternates to "Added." Rotates so the message doesn't feel
// like a system notification. Kept ≤3 words and event-mood, not robotic.
const CAPTURE_TONES = [
  "Captured.",
  "One more.",
  "Added to the night.",
  "Snapped.",
  "Into the album.",
];

function LayoutInner() {
  const { addShot, shots } = usePhotos();
  const { show } = useToast();
  const navigate = useNavigate();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  const lastPhotoUrl = useMemo(
    () => shots.find((s) => !s.seed && s.mediaType !== "video")?.url ?? null,
    [shots],
  );
  const photoCount = useMemo(
    () => shots.filter((s) => !s.seed && s.mediaType !== "video").length,
    [shots],
  );

  // Capture → optimistic toast. Confirm-toast (synced) would be noisy at scale,
  // so we only speak up on the action the guest just took and on failure.
  const handleCapture = useCallback((blob, meta) => {
    const added = addShot(blob, meta);
    if (!added) return null;
    const tone = meta?.mediaType === "video"
      ? "Video saved."
      : CAPTURE_TONES[Math.floor(Math.random() * CAPTURE_TONES.length)];
    // Defer toast so the camera overlay isn't competing with capture/review paint.
    requestAnimationFrame(() => show(tone));
    return added;
  }, [addShot, show]);

  const handleViewLastPhoto = useCallback(() => {
    setCameraOpen(false);
    navigate("gallery"); // relative — stays under the current /e/<slug>
  }, [navigate]);

  // Upload-failure toast with one-tap retry. Only fires for terminal failures
  // (after the queue has exhausted its backoff and flipped the shot to "failed").
  useEffect(() => {
    return subscribe((id, patch) => {
      if (patch.status === "failed") {
        show("A photo didn't upload", {
          duration: 5000,
          action: { label: "Retry", onClick: () => retry(id) },
        });
      }
    });
  }, [show]);

  // First-visit gate: open the welcome modal if the user hasn't dismissed it
  // OR if we don't have a guest identity yet (so existing "welcomed" users
  // from before the name-gate landed still get prompted once).
  useEffect(() => {
    try {
      const welcomed = localStorage.getItem(WELCOME_KEY);
      if (!welcomed || !getGuest()) setWelcomeOpen(true);
    } catch { /* private mode — silently skip */ }
  }, []);

  // Session refresh, event content and face-model warmup live in
  // EventBoundary now — they re-run when the event slug changes, not just
  // once per Layout mount.

  // Let any descendant re-open the modal via window.dispatchEvent(...)
  useEffect(() => {
    function reopen() { setWelcomeOpen(true); }
    window.addEventListener("fg:show-welcome", reopen);
    return () => window.removeEventListener("fg:show-welcome", reopen);
  }, []);

  return (
    <div className="app">
      <Navbar />
      <OfflineBanner />
      <main className="outlet">
        <Outlet context={{ openCamera: () => setCameraOpen(true) }} />
        <AppFooter />
      </main>
      <Fab onClick={() => setCameraOpen(true)} />
      <BottomTabBar onCapture={() => setCameraOpen(true)} />

      <AnimatePresence>
        {cameraOpen && (
          <CameraView
            key="camera"
            onCapture={handleCapture}
            onClose={() => setCameraOpen(false)}
            lastPhotoUrl={lastPhotoUrl}
            photoCount={photoCount}
            onViewLastPhoto={handleViewLastPhoto}
          />
        )}
      </AnimatePresence>
      {welcomeOpen && <WelcomeModal onClose={() => setWelcomeOpen(false)} />}
    </div>
  );
}
