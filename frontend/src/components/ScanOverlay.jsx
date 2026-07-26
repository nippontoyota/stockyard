import React, { useEffect, useRef } from 'react';
import { scanHaptic } from '../haptics.js';

/**
 * §3.2 — Full-screen scan result overlay.
 * Success: green + checkmark, auto-dismiss 3s.
 * Error: red + X, manual dismiss.
 * Flagged: amber, manual dismiss.
 */
export function ScanOverlay({ result, onDismiss }) {
  const timerRef = useRef(null);

  useEffect(() => {
    if (!result) return;

    // Haptic feedback
    if (result.type === 'success') {
      scanHaptic('success');
      timerRef.current = setTimeout(onDismiss, 3000);
    } else if (result.type === 'error') {
      scanHaptic('error');
    } else if (result.type === 'flagged') {
      scanHaptic('flagged');
    }

    // Set theme-color meta for immersive feel
    const meta = document.querySelector('meta[name="theme-color"]');
    const originalColor = meta?.getAttribute('content');
    if (meta) {
      const colors = { success: '#059669', error: '#dc2626', flagged: '#d97706' };
      meta.setAttribute('content', colors[result.type] || '#0b1c30');
    }

    return () => {
      clearTimeout(timerRef.current);
      if (meta && originalColor) meta.setAttribute('content', originalColor);
    };
  }, [result, onDismiss]);

  if (!result) return null;

  const config = {
    success: {
      bg: 'var(--overlay-success, #059669)',
      icon: '✓',
      title: 'Scan Accepted',
    },
    error: {
      bg: 'var(--overlay-error, #dc2626)',
      icon: '✕',
      title: 'Scan Rejected',
    },
    flagged: {
      bg: 'var(--overlay-flagged, #d97706)',
      icon: '⚠',
      title: 'Scan Flagged',
    },
  }[result.type] || { bg: '#333', icon: '?', title: 'Unknown' };

  return (
    <div className="scan-overlay" style={{ background: config.bg }} onClick={result.type !== 'success' ? undefined : onDismiss}>
      <div className="scan-overlay-content">
        <div className="scan-overlay-icon">{config.icon}</div>
        <h2 className="scan-overlay-title">{config.title}</h2>
        {result.vin && <p className="scan-overlay-vin">{result.vin}</p>}
        {result.model && <p className="scan-overlay-model">{result.model}</p>}
        {result.message && <p className="scan-overlay-message">{result.message}</p>}
        {result.flags && result.flags.length > 0 && (
          <div className="scan-overlay-flags">
            {result.flags.map((f, i) => <span key={i} className="scan-overlay-flag-pill">{f}</span>)}
          </div>
        )}
        {result.type !== 'success' && (
          <button className="scan-overlay-dismiss" onClick={onDismiss}>Dismiss</button>
        )}
      </div>
    </div>
  );
}
