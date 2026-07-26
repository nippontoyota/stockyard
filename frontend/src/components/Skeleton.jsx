import React from 'react';

/** §3.9 — Skeleton loading placeholders */

export function SkeletonKpi({ count = 4 }) {
  return (
    <div className="skeleton-kpi-row">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton skeleton-kpi" />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div className="skeleton-table">
      <div className="skeleton skeleton-table-header" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-table-row">
          {Array.from({ length: cols }, (_, j) => (
            <div key={j} className="skeleton skeleton-cell" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard({ count = 3 }) {
  return (
    <div className="skeleton-card-grid">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton skeleton-card">
          <div className="skeleton skeleton-card-title" />
          <div className="skeleton skeleton-card-line" />
          <div className="skeleton skeleton-card-line short" />
        </div>
      ))}
    </div>
  );
}
