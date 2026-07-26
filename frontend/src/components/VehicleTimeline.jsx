import React, { useState } from 'react';

/**
 * §4.2 — Vertical vehicle timeline.
 * Shows IN/OUT events with dwell time calculations.
 */
export function VehicleTimeline({ scans = [], vin, onForceClose }) {
  const [expandedId, setExpandedId] = useState(null);

  if (!scans.length) {
    return <div className="timeline-empty">No scan history for this vehicle.</div>;
  }

  // Sort chronologically (oldest first)
  const sorted = [...scans].sort((a, b) =>
    new Date(a.scannedAt || a.scanned_at).getTime() - new Date(b.scannedAt || b.scanned_at).getTime()
  );

  return (
    <div className="vehicle-timeline">
      <h3 className="timeline-header">Vehicle History — {vin}</h3>
      <div className="timeline-track">
        {sorted.map((scan, i) => {
          const time = new Date(scan.scannedAt || scan.scanned_at);
          const type = (scan.type || scan.scan_type || '').toLowerCase();
          const isIn = type === 'in';
          const isExpanded = expandedId === (scan.id || i);

          // Calculate dwell time to next event
          let dwellText = null;
          if (i < sorted.length - 1) {
            const next = new Date(sorted[i + 1].scannedAt || sorted[i + 1].scanned_at);
            const diffMs = next.getTime() - time.getTime();
            const hours = Math.floor(diffMs / 3600000);
            const days = Math.floor(hours / 24);
            const remainingHours = hours % 24;
            dwellText = days > 0 ? `${days}d ${remainingHours}h` : `${hours}h`;
          }

          return (
            <div key={scan.id || i} className="timeline-event">
              <div className="timeline-marker-col">
                <div className={`timeline-dot ${isIn ? 'dot-in' : 'dot-out'}`} />
                {i < sorted.length - 1 && (
                  <div className="timeline-connector">
                    {dwellText && <span className="timeline-dwell">↓ {dwellText}</span>}
                  </div>
                )}
              </div>
              <div
                className={`timeline-card ${isExpanded ? 'expanded' : ''}`}
                onClick={() => setExpandedId(isExpanded ? null : (scan.id || i))}
              >
                <div className="timeline-card-header">
                  <span className={`timeline-pill ${isIn ? 'pill-in' : 'pill-out'}`}>
                    {isIn ? 'IN' : 'OUT'}
                  </span>
                  <span className="timeline-time">
                    {time.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {' '}
                    {time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="timeline-yard">{scan.yardId || scan.yard_id}</span>
                </div>
                {isExpanded && (
                  <div className="timeline-details">
                    {scan.outRemark || scan.out_remark ? <p><strong>Remark:</strong> {scan.outRemark || scan.out_remark}</p> : null}
                    {scan.keyNo || scan.key_no ? <p><strong>Key No:</strong> {scan.keyNo || scan.key_no}</p> : null}
                    {scan.damaged && <p className="timeline-damage"><strong>⚠ Damaged:</strong> {scan.damageRemark || scan.damage_remark || 'Yes'}</p>}
                    {scan.transferDestinationYardId || scan.transfer_destination_yard_id ? (
                      <p><strong>Transfer to:</strong> {scan.transferDestinationYardId || scan.transfer_destination_yard_id}</p>
                    ) : null}
                    {(scan.latitude || scan.gps_accuracy_meters) && (
                      <p className="timeline-gps"><strong>GPS:</strong> ±{scan.gps_accuracy_meters || '?'}m</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {onForceClose && (
        <button className="timeline-force-close" onClick={onForceClose}>
          Force Close Vehicle
        </button>
      )}
    </div>
  );
}
