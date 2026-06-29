import React, { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import Navbar from "./Navbar.jsx";
import BottomTabBar from "./BottomTabBar.jsx";
import Fab from "./Fab.jsx";
import CameraView from "./CameraView.jsx";
import WelcomeModal, { WELCOME_KEY } from "./WelcomeModal.jsx";
import AppFooter from "./AppFooter.jsx";
import { PhotosProvider, usePhotos } from "../state/PhotosContext.jsx";

/**
 * Wraps every route. Holds the camera overlay state so any screen, FAB, or
 * bottom-bar capture button can launch it without prop-drilling.
 */
export default function Layout() {
  return (
    <PhotosProvider>
      <LayoutInner />
    </PhotosProvider>
  );
}

function LayoutInner() {
  const { addShot, removeShot } = usePhotos();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  // First-visit gate: open the welcome modal if the user hasn't dismissed it.
  useEffect(() => {
    try {
      if (!localStorage.getItem(WELCOME_KEY)) setWelcomeOpen(true);
    } catch { /* private mode — silently skip */ }
  }, []);

  // Let any descendant re-open the modal via window.dispatchEvent(...)
  useEffect(() => {
    function reopen() { setWelcomeOpen(true); }
    window.addEventListener("fg:show-welcome", reopen);
    return () => window.removeEventListener("fg:show-welcome", reopen);
  }, []);

  return (
    <div className="app">
      <Navbar />
      <main className="outlet">
        <Outlet context={{ openCamera: () => setCameraOpen(true) }} />
        <AppFooter />
      </main>
      <Fab onClick={() => setCameraOpen(true)} />
      <BottomTabBar onCapture={() => setCameraOpen(true)} />

      {cameraOpen && (
        <CameraView
          onCapture={addShot}
          onUndoCapture={removeShot}
          onClose={() => setCameraOpen(false)}
        />
      )}
      {welcomeOpen && <WelcomeModal onClose={() => setWelcomeOpen(false)} />}
    </div>
  );
}
