import React from "react";
import { NavLink } from "react-router-dom";
import { useEventContent } from '@/state/eventContent.js';

export default function Navbar() {
  const { initials, features } = useEventContent();
  const showInitials = features.navbarInitials !== false && Boolean(initials?.trim());
  const showStory = features.storyNav !== false && features.story !== false;
  return (
    <header className={`nav${showInitials ? "" : " nav--no-initials"}`}>
      <div className="nav-inner">
        <NavLink to="." className="nav-brand" aria-label="Home">
          <img src="/logo.svg" alt="" className="nav-logo" />
        </NavLink>
        {showInitials && <span className="nav-initials">{initials}</span>}
        <nav className="nav-links">
          <NavLink to="." end className={navClass}>Tonight</NavLink>
          <NavLink to="gallery" className={navClass}>Gallery</NavLink>
          <NavLink to="me" className={navClass}>Me</NavLink>
          {showStory && <NavLink to="story" className={navClass}>Story</NavLink>}
        </nav>
      </div>
    </header>
  );
}

const navClass = ({ isActive }) => (isActive ? "nav-link nav-link-active" : "nav-link");
