import React from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Layout from '@/components/layout/Layout.jsx';
import Tonight from '@/features/tonight/Tonight.jsx';
import Gallery from '@/features/gallery/Gallery.jsx';
import Me from '@/features/me/Me.jsx';
import Story from '@/features/story/Story.jsx';
import NotFound from '@/features/not-found/NotFound.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Tonight />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/me" element={<Me />} />
          <Route path="/story" element={<Story />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
