import React, { useState, useEffect, useRef } from 'react';

/**
 * §3.5 — GPS status badge for scan view.
 * Shows acquiring/locked/unavailable state with accuracy.
 * 15s timeout then offers "Proceed without GPS?" override.
 */
export function GpsStatus({ onGpsReady, onGpsOverride }) {
  const [status, setStatus] = useState('acquiring'); // 'acquiring' | 'locked' | 'unavailable'
  const [accuracy, setAccuracy] = useState(null);
  const [coords, setCoords] = useState(null);
  const [showOverride, setShowOverride] = useState(false);
  const watchRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setStatus('unavailable');
      setShowOverride(true);
      return;
    }

    // 15s timeout for GPS lock
    timeoutRef.current = setTimeout(() => {
      if (status === 'acquiring') {
        setShowOverride(true);
      }
    }, 15000);

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setStatus('locked');
        setAccuracy(Math.round(pos.coords.accuracy));
        const gps = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        setCoords(gps);
        if (onGpsReady) onGpsReady(gps);
        clearTimeout(timeoutRef.current);
        setShowOverride(false);
      },
      (err) => {
        console.warn('[gps]', err.message);
        setStatus('unavailable');
        setShowOverride(true);
        clearTimeout(timeoutRef.current);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );

    return () => {
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
      clearTimeout(timeoutRef.current);
    };
  }, []);

  const badges = {
    acquiring: { emoji: '🟡', text: 'Acquiring GPS...', className: 'gps-acquiring' },
    locked: { emoji: '🟢', text: `GPS locked (±${accuracy}m)`, className: 'gps-locked' },
    unavailable: { emoji: '🔴', text: 'GPS unavailable', className: 'gps-unavailable' },
  };

  const badge = badges[status];

  return (
    <div className={`gps-status ${badge.className}`}>
      <span className="gps-badge">
        <span className="gps-emoji">{badge.emoji}</span>
        <span className="gps-text">{badge.text}</span>
        {status === 'acquiring' && <span className="gps-spinner" />}
      </span>
      {showOverride && status !== 'locked' && (
        <button
          className="gps-override-btn"
          onClick={() => {
            if (onGpsOverride) onGpsOverride(coords);
          }}
        >
          Proceed without GPS
        </button>
      )}
    </div>
  );
}
