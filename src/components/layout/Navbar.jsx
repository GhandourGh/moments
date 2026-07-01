import React from "react";
import { NavLink } from "react-router-dom";
import { COUPLE } from '@/config/couple.js';

export default function Navbar() {
  return (
    <header className="nav">
      <div className="nav-inner">
        <NavLink to="/" className="nav-brand" aria-label="Home">
          <img src="/logo.svg" alt="" className="nav-logo" />
        </NavLink>
        <span className="nav-initials">{COUPLE.initials}</span>
        <nav className="nav-links">
          <NavLink to="/" end className={navClass}>Tonight</NavLink>
          <NavLink to="/gallery" className={navClass}>Gallery</NavLink>
          <NavLink to="/me" className={navClass}>Me</NavLink>
          <NavLink to="/story" className={navClass}>Story</NavLink>
        </nav>
      </div>
    </header>
  );
}

const navClass = ({ isActive }) => (isActive ? "nav-link nav-link-active" : "nav-link");
