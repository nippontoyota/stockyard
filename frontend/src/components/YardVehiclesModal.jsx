import React, { useState, useEffect } from "react";
import { decodeVinDetails, flagLabel } from "../stockyardLogic.js";

export function YardVehiclesModal({ yard, state, onClose }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    if (!yard) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [yard]);

  if (!yard) return null;

  const allVehicles = state ? Object.values(state.vehicles) : [];
  const yardVehicles = allVehicles.filter(
    (v) => v.currentYardId === yard.id || v.currentYardId === yard.code
  );

  const filteredVehicles = yardVehicles.filter((v) => {
    const matchesStatus = statusFilter === "all" || v.currentStatus === statusFilter;
    const decoded = decodeVinDetails(v.vin);
    const displayModel = v.model && v.model !== "Unknown" && v.model !== "Toyota Vehicle" ? v.model : decoded.model;
    const displayVariant = v.variant && v.variant !== "Standard" ? v.variant : decoded.variant;
    const searchString = `${v.vin} ${displayModel} ${displayVariant} ${v.colour || ""}`.toLowerCase();
    const matchesSearch = searchString.includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const countIn = yardVehicles.filter((v) => v.currentStatus === "in").length;
  const countOut = yardVehicles.filter((v) => v.currentStatus === "out").length;
  const emptySpace = Math.max(0, yard.capacity - countIn);

  return (
    <div className="modal-overlay" onClick={onClose} aria-modal="true" role="dialog">
      <div className="modal-content yard-modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div>
            <div className="modal-badge-row">
              <span className="eyebrow">{yard.code}</span>
              <span className="modal-chip capacity">Capacity {yard.capacity}</span>
              <span className="modal-chip occupied">{countIn} IN</span>
              <span className="modal-chip empty">{emptySpace} Free</span>
            </div>
            <h2>{yard.name}</h2>
          </div>
          <button className="close-modal-btn" onClick={onClose} aria-label="Close dialog">
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        <div className="modal-body">
          <div className="modal-controls">
            <div className="search-row modal-search">
              <span className="material-symbols-outlined">search</span>
              <input
                className="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search VIN or model in this yard..."
              />
            </div>
            <div className="segmented modal-tabs">
              <button
                type="button"
                className={statusFilter === "all" ? "active" : ""}
                onClick={() => setStatusFilter("all")}
              >
                All ({yardVehicles.length})
              </button>
              <button
                type="button"
                className={statusFilter === "in" ? "active" : ""}
                onClick={() => setStatusFilter("in")}
              >
                Parked IN ({countIn})
              </button>
              <button
                type="button"
                className={statusFilter === "out" ? "active" : ""}
                onClick={() => setStatusFilter("out")}
              >
                Moved OUT ({countOut})
              </button>
            </div>
          </div>

          <div className="modal-list-header">
            <span>Showing {filteredVehicles.length} of {yardVehicles.length} vehicle{yardVehicles.length === 1 ? "" : "s"}</span>
          </div>

          <div className="modal-vehicle-list">
            {filteredVehicles.length === 0 ? (
              <div className="no-results modal-no-results">
                <span className="material-symbols-outlined">directions_car</span>
                <p>No vehicles found {statusFilter !== "all" ? `with status ${statusFilter.toUpperCase()}` : "in this stockyard"}.</p>
              </div>
            ) : (
              filteredVehicles.map((vehicle) => {
                const activeFlag = state?.flags?.find((f) => f.vin === vehicle.vin && !f.resolved);
                const decoded = decodeVinDetails(vehicle.vin);
                const displayModel = vehicle.model && vehicle.model !== "Unknown" && vehicle.model !== "Toyota Vehicle" ? vehicle.model : decoded.model;
                const displayVariant = vehicle.variant && vehicle.variant !== "Standard" ? vehicle.variant : decoded.variant;

                return (
                  <div key={vehicle.vin} className={`vehicle-row-card ${vehicle.currentStatus} ${activeFlag ? "flagged" : ""}`}>
                    <div className="v-row-mark">
                      <span className="material-symbols-outlined">
                        {vehicle.currentStatus === "in" ? "directions_car" : "logout"}
                      </span>
                    </div>
                    <div className="v-row-info">
                      <div className="v-row-top">
                        <strong>{vehicle.vin}</strong>
                        {activeFlag && (
                          <span className="badge bad">{flagLabel(activeFlag.type)}</span>
                        )}
                      </div>
                      <small>{displayModel} · {displayVariant}</small>
                    </div>
                    <div className="v-row-status">
                      <span className={`status-tag ${vehicle.currentStatus}`}>
                        {vehicle.currentStatus.toUpperCase()}
                      </span>
                      <small>{vehicle.lastChangedAt ? new Date(vehicle.lastChangedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</small>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <footer className="modal-footer">
          <span className="modal-footer-note">Scroll to view all cars</span>
          <button className="primary modal-done-btn" onClick={onClose}>Done</button>
        </footer>
      </div>
    </div>
  );
}
