import React from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Tonight from "./routes/Tonight.jsx";
import Gallery from "./routes/Gallery.jsx";
import Me from "./routes/Me.jsx";
import Story from "./routes/Story.jsx";
import NotFound from "./routes/NotFound.jsx";

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
