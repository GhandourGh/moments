import React from "react";

/**
 * Last-resort frame around the route tree. Any render crash gets caught
 * and replaced with a calm fallback + reload affordance, so a single buggy
 * component can't blank the whole event app mid-celebration.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Surfaces in DevTools; no remote logging until a real backend exists.
    console.error("[guest-ui] render crash", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="err-boundary">
        <h1 className="err-title">Something hiccuped.</h1>
        <p className="err-body">
          Reload the page to keep going — your captured photos are safe on this
          device.
        </p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
