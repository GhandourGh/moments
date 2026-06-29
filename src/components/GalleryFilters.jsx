import React from "react";

/**
 * Three-chip filter row for the Gallery. Controlled component — parent owns
 * the active value and the photo-filtering logic.
 */
const OPTIONS = [
  { id: "all",   label: "All" },
  { id: "yours", label: "Yours" },
  { id: "hour",  label: "Last hour" },
];

export default function GalleryFilters({ value, onChange }) {
  return (
    <div className="gf" role="tablist" aria-label="Filter photos">
      {OPTIONS.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`gf-chip ${active ? "gf-chip-active" : ""}`}
            onClick={() => onChange(opt.id)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
