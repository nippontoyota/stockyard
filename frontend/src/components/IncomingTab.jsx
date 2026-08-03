import React, { useCallback, useEffect, useState } from "react";
import { getIncomingVehicles, receiveIncomingVehicle } from "../api.js";
import { findYardById } from "../stockyardLogic.js";

function formatWhen(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function IncomingTab({ session, onRefresh }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmVin, setConfirmVin] = useState(null);
  const [receivingVin, setReceivingVin] = useState(null);
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getIncomingVehicles();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Could not load incoming vehicles.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, session?.yardId, session?.branchId]);

  const confirmItem = items.find((v) => v.vin === confirmVin) || null;

  async function handleReceive() {
    if (!confirmItem) return;
    setReceivingVin(confirmItem.vin);
    setActionError("");
    try {
      await receiveIncomingVehicle(confirmItem.vin, {
        device_fingerprint: localStorage.getItem("yardDeviceId") || undefined,
      });
      setConfirmVin(null);
      await load();
      onRefresh?.();
    } catch (err) {
      setActionError(err.message || "Receive failed.");
    } finally {
      setReceivingVin(null);
    }
  }

  return (
    <section className="incoming-tab stack">
      <header className="incoming-header">
        <div>
          <span className="eyebrow">Expected arrivals</span>
          <h2>Incoming ({items.length})</h2>
          <p className="muted">Vehicles in transit to your yard — receive them when they arrive.</p>
        </div>
        <button type="button" className="ghost" onClick={load} disabled={loading}>
          <span className="material-symbols-outlined">refresh</span>
          Refresh
        </button>
      </header>

      {loading && (
        <div className="incoming-loading">
          <div className="skeleton" style={{ height: 72, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 72 }} />
        </div>
      )}

      {!loading && error && <p className="notice bad">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <div className="incoming-empty">
          <span className="material-symbols-outlined">local_shipping</span>
          <h3>No vehicles on the way</h3>
          <p>When a car is transferred to this yard, it will show up here to receive.</p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="incoming-list">
          {items.map((vehicle) => {
            const dest = findYardById(vehicle.current_yard_id);
            const source = findYardById(vehicle.source_yard_id);
            return (
              <article key={vehicle.vin} className="incoming-card">
                <div className="incoming-card-main">
                  <span className="vehicle-mark">{(vehicle.model || "V").slice(0, 1)}</span>
                  <div>
                    <strong>{vehicle.model || "Model not set"}</strong>
                    <span className="incoming-vin">{vehicle.vin}</span>
                    <small>
                      To {dest ? `${dest.code} · ${dest.name}` : vehicle.current_yard_id || "yard"}
                      {source ? ` · from ${source.code}` : ""}
                      {vehicle.last_changed_at ? ` · ${formatWhen(vehicle.last_changed_at)}` : ""}
                    </small>
                  </div>
                </div>
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    setActionError("");
                    setConfirmVin(vehicle.vin);
                  }}
                >
                  Receive
                </button>
              </article>
            );
          })}
        </div>
      )}

      {confirmItem && (
        <div className="modal-overlay" onClick={() => !receivingVin && setConfirmVin(null)} role="dialog" aria-modal="true">
          <div className="modal-content incoming-confirm" onClick={(e) => e.stopPropagation()}>
            <h3>Confirm receive</h3>
            <dl className="incoming-confirm-summary">
              <div><dt>Model</dt><dd>{confirmItem.model || "Model not set"}</dd></div>
              <div><dt>VIN</dt><dd>{confirmItem.vin}</dd></div>
              <div>
                <dt>Yard</dt>
                <dd>
                  {findYardById(confirmItem.current_yard_id)?.name || confirmItem.current_yard_id}
                </dd>
              </div>
            </dl>
            <p className="muted">This marks the vehicle IN at the destination yard.</p>
            {actionError && <p className="notice bad">{actionError}</p>}
            <div className="incoming-confirm-actions">
              <button type="button" className="ghost" disabled={Boolean(receivingVin)} onClick={() => setConfirmVin(null)}>
                Cancel
              </button>
              <button type="button" className="primary" disabled={Boolean(receivingVin)} onClick={handleReceive}>
                {receivingVin ? "Receiving…" : "Confirm receive"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
