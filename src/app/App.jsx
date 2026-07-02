import React, { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from '@/components/layout/Layout.jsx';
import EventBoundary from '@/components/layout/EventBoundary.jsx';
import Tonight from '@/features/tonight/Tonight.jsx';
import Gallery from '@/features/gallery/Gallery.jsx';
import Me from '@/features/me/Me.jsx';
import Story from '@/features/story/Story.jsx';
import NotFound from '@/features/not-found/NotFound.jsx';

// Host tools are admin-only and pull in the QR library — keep them out of
// the guest bundle. Also outside <Layout/> so hosts skip the welcome gate.
const Host = lazy(() => import('@/features/host/Host.jsx'));

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
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
        {/* The domain root is the admin entrance. */}
        <Route path="/" element={<Navigate to="/host" replace />} />
        <Route path="*" element={<NotFound standalone />} />
      </Routes>
    </BrowserRouter>
  );
}
