import React, { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from '@/components/layout/Layout.jsx';
import EventBoundary from '@/components/layout/EventBoundary.jsx';
import Tonight from '@/features/tonight/Tonight.jsx';
import Gallery from '@/features/gallery/Gallery.jsx';
import Me from '@/features/me/Me.jsx';
import Story from '@/features/story/Story.jsx';
import NotFound from '@/features/not-found/NotFound.jsx';

// Host tools and admin dashboard are passcode-protected — lazy-loaded.
const Host = lazy(() => import('@/features/host/Host.jsx'));
const Admin = lazy(() => import('@/features/admin/Admin.jsx'));

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/admin"
          element={
            <Suspense fallback={null}>
              <Admin />
            </Suspense>
          }
        />
        <Route
          path="/host"
          element={
            <Suspense fallback={null}>
              <Host />
            </Suspense>
          }
        />
        {/* Guests always arrive via /e/<slug> QR links; the boundary binds
            the API client + session + content to that event. */}
        <Route path="/e/:eventSlug" element={<EventBoundary />}>
          <Route element={<Layout />}>
            <Route index element={<Tonight />} />
            <Route path="gallery" element={<Gallery />} />
            <Route path="me" element={<Me />} />
            <Route path="story" element={<Story />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
        {/* The domain root is the admin dashboard. */}
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route path="*" element={<NotFound standalone />} />
      </Routes>
    </BrowserRouter>
  );
}
