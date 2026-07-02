import React from "react";
import { NavLink } from "react-router-dom";
import { useEventContent } from '@/state/eventContent.js';

export default function Navbar() {
  const { initials } = useEventContent();
  return (
    <header className="nav">
      {/* Relative targets — Navbar renders inside the pathless Layout route,
          so "." and "gallery" resolve under the current /e/<slug>. */}
      <div className="nav-inner">
        <NavLink to="." className="nav-brand" aria-label="Home">
          <img src="/logo.svg" alt="" className="nav-logo" />
        </NavLink>
        <span className="nav-initials">{initials}</span>
        <nav className="nav-links">
          <NavLink to="." end className={navClass}>Tonight</NavLink>
          <NavLink to="gallery" className={navClass}>Gallery</NavLink>
          <NavLink to="me" className={navClass}>Me</NavLink>
          <NavLink to="story" className={navClass}>Story</NavLink>
        </nav>
      </div>
    </header>
  );
}

const navClass = ({ isActive }) => (isActive ? "nav-link nav-link-active" : "nav-link");
