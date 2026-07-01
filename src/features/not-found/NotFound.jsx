import React from "react";
import { Link } from "react-router-dom";
import { COUPLE } from '@/config/couple.js';

export default function NotFound() {
  return (
    <section className="page-section nf">
      <h1 className="nf-title">This page slipped away.</h1>
      <p className="nf-body">
        That link doesn't go anywhere on {COUPLE.initials}'s gallery. Head back
        to the home screen and pick up from there.
      </p>
      <Link to="/" className="btn btn-primary">Back to home</Link>
    </section>
  );
}
