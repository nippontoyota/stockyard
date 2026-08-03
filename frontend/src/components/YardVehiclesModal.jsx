import React, { useState, useEffect } from "react";
import { flagLabel, createScan, applyScan, yardsByRegion, findYardById, findApprovedTransferReq } from "../stockyardLogic.js";
import { bulkSync } from "../api.js";
import { exportYardVehiclesExcel } from "../exportStockExcel.js";
import { VehicleTimeline } from "./VehicleTimeline.jsx";
import { AdminVehicleDeleteButton } from "./AdminVehicleDeleteButton.jsx";

function driveLabel(value) {
  if (!value) return "";
  return String(value).replace(/_/g, " ");
}

function AdminOutForm({ vin, yard, vehicle, state, setState, requisitions, onDone }) {
  const [outRemark, setOutRemark] = useState("");
  const [transferDestinationYardId, setTransferDestinationYardId] = useState("");
  const [transferRequestedBy, setTransferRequestedBy] = useState("");
  const [keyNo, setKeyNo] = useState(vehicle?.keyNo || "");
  const [driveType, setDriveType] = useState(vehicle?.driveType || "");
  const [damaged, setDamaged] = useState(false);
  const [damageRemark, setDamageRemark] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const req = findApprovedTransferReq(requisitions, vin);
    if (!req) return;
    setOutRemark("stockyard_transfer");
    setTransferRequestedBy(req.requested_by || "");
    const destYard = req.requesting_branch?.yards?.[0]?.id;
    if (destYard) setTransferDestinationYardId(destYard);
  }, [vin, requisitions]);

  const displayModel = vehicle?.model || "Model not set";

  async function submitOut() {
    setError("");
    setLoading(true);
    try {
      const scan = createScan({
        vin,
        type: "out",
        yardId: yard.id,
        outRemark,
        transferDestinationYardId,
        transferRequestedBy,
        keyNo,
        damaged,
        damageRemark,
        damageImage: "",
        driveType,
      });
      const result = applyScan(state, scan);
      if (!result.accepted) {
        setError(result.message || "OUT rejected.");
        setLoading(false);
        return;
      }
      await bulkSync([scan]);
      setState(result.state);
      onDone();
    } catch (err) {
      setError(err.message || "OUT failed. Check connection and try again.");
      setLoading(false);
    }
  }

  function validate() {
    if (!outRemark) return "Select an OUT reason.";
    if (outRemark === "stockyard_transfer" && !transferDestinationYardId) {
      return "Select destination yard for transfer.";
    }
    if (outRemark === "stockyard_transfer" && !transferRequestedBy.trim()) {
      return "Enter who requested the transfer.";
    }
    if (damaged && !damageRemark.trim()) return "Add the damage remark.";
    return "";
  }

  function onSubmit(event) {
    event.preventDefault();
    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }
    setError("");
    setConfirming(true);
  }

  if (confirming) {
    return (
      <div className="admin-out-panel admin-out-confirm" role="status">
        <h4>Confirm OUT</h4>
        <dl className="admin-out-summary">
          <div><dt>VIN</dt><dd>{vin}</dd></div>
          <div><dt>Model</dt><dd>{displayModel}</dd></div>
          <div><dt>Reason</dt><dd>{outRemark === "customer_acquisition" ? "Customer Acquisition" : "Stockyard Transfer"}</dd></div>
          {outRemark === "stockyard_transfer" && (
            <>
              <div>
                <dt>Transfer to</dt>
                <dd>
                  {findYardById(transferDestinationYardId)?.name || transferDestinationYardId}
                </dd>
              </div>
              <div><dt>Requested by</dt><dd>{transferRequestedBy}</dd></div>
            </>
          )}
          {keyNo ? <div><dt>Key No</dt><dd>{keyNo}</dd></div> : null}
          {driveType ? <div><dt>Drive</dt><dd>{driveType.replace(/_/g, " ")}</dd></div> : null}
          {damaged ? <div><dt>Damage</dt><dd>{damageRemark}</dd></div> : null}
        </dl>
        <p className="admin-out-note">No photo required for admin OUT.</p>
        {error && <p className="notice bad">{error}</p>}
        <div className="admin-out-actions">
          <button type="button" className="ghost" disabled={loading} onClick={() => setConfirming(false)}>
            Back
          </button>
          <button type="button" className="primary" disabled={loading} onClick={submitOut}>
            {loading ? "Recording…" : "Confirm OUT"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="admin-out-panel" onSubmit={onSubmit}>
      <div className="admin-out-heading">
        <span className="material-symbols-outlined" aria-hidden="true">logout</span>
        <div>
          <h4>Mark vehicle OUT</h4>
          <p>Same details as a yard OUT scan. Photo skipped.</p>
        </div>
      </div>

      <label className="admin-out-field-label" htmlFor="admin-out-reason">OUT reason</label>
      <select
        id="admin-out-reason"
        value={outRemark}
        onChange={(e) => {
          setOutRemark(e.target.value);
          if (e.target.value !== "stockyard_transfer") {
            setTransferDestinationYardId("");
            setTransferRequestedBy("");
          }
          setError("");
        }}
        required
      >
        <option value="">Select reason</option>
        <option value="customer_acquisition">Customer Acquisition</option>
        <option value="stockyard_transfer">Stockyard Transfer</option>
      </select>

      {outRemark === "stockyard_transfer" && (
        <>
          <label className="admin-out-field-label" htmlFor="admin-out-dest">Transfer destination</label>
          <select
            id="admin-out-dest"
            value={transferDestinationYardId}
            onChange={(e) => {
              setTransferDestinationYardId(e.target.value);
              setError("");
            }}
            required
          >
            <option value="">Select destination yard</option>
            {yardsByRegion().map(({ region, yards: regionYards }) => {
              const options = regionYards.filter((y) => y.id !== yard.id);
              if (!options.length) return null;
              return (
                <optgroup key={region} label={region}>
                  {options.map((y) => (
                    <option key={y.id} value={y.id}>{y.code} · {y.name}</option>
                  ))}
                </optgroup>
              );
            })}
          </select>

          <label className="admin-out-field-label" htmlFor="admin-out-requester">Requested by</label>
          <input
            id="admin-out-requester"
            value={transferRequestedBy}
            onChange={(e) => {
              setTransferRequestedBy(e.target.value);
              setError("");
            }}
            placeholder="Person who requested transfer"
            required
          />
        </>
      )}

      <label className="admin-out-field-label" htmlFor="admin-out-key">Key No.</label>
      <input
        id="admin-out-key"
        value={keyNo}
        onChange={(e) => setKeyNo(e.target.value)}
        placeholder="Optional, e.g. K-101"
      />

      <label className="admin-out-field-label" htmlFor="admin-out-drive">Drive type</label>
      <select
        id="admin-out-drive"
        value={driveType}
        onChange={(e) => setDriveType(e.target.value)}
      >
        <option value="">Select drive type</option>
        <option value="neo_drive">Neo Drive</option>
        <option value="hybrid">Hybrid</option>
        <option value="petrol">Petrol</option>
        <option value="diesel">Diesel</option>
      </select>

      <label className="check admin-out-damage-check">
        <input
          type="checkbox"
          checked={damaged}
          onChange={(e) => {
            setDamaged(e.target.checked);
            if (!e.target.checked) setDamageRemark("");
            setError("");
          }}
        />
        Car damaged
      </label>

      {damaged && (
        <textarea
          value={damageRemark}
          onChange={(e) => {
            setDamageRemark(e.target.value);
            setError("");
          }}
          rows={2}
          placeholder="Type of damage & details..."
          required
        />
      )}

      {error && <p className="notice bad">{error}</p>}

      <button type="submit" className="primary admin-out-submit">
        Continue to confirm OUT
      </button>
    </form>
  );
}

export function YardVehiclesModal({ yard, state, setState, onClose, readOnly = false }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedVin, setSelectedVin] = useState(null);

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
  const yardVehicles = allVehicles.filter((v) => v.currentYardId === yard.id);

  const filteredVehicles = yardVehicles.filter((v) => {
    const matchesStatus = statusFilter === "all" || v.currentStatus === statusFilter;
    const searchString = `${v.vin} ${v.model || ""}`.toLowerCase();
    const matchesSearch = searchString.includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const countIn = yardVehicles.filter((v) => v.currentStatus === "in").length;
  const countOut = yardVehicles.filter((v) => v.currentStatus === "out").length;
  const emptySpace = Math.max(0, yard.capacity - countIn);
  const selectedVehicle = selectedVin ? state?.vehicles?.[selectedVin] : null;
  const canMarkOut = !readOnly && selectedVehicle?.currentStatus === "in";

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
                const displayModel = vehicle.model || "Model not set";

                return (
                  <div key={vehicle.vin} className={`vehicle-row-card ${vehicle.currentStatus} ${activeFlag ? "flagged" : ""}`} onClick={() => setSelectedVin(vehicle.vin)} style={{ cursor: "pointer" }}>
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
                      <small>{displayModel}{vehicle.keyNo ? ` · Key No: ${vehicle.keyNo}` : ""}</small>
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

        {selectedVin && (
          <div className="modal-overlay nested-modal-overlay" onClick={() => setSelectedVin(null)}>
            <div className="modal-content vehicle-history-modal" onClick={(e) => e.stopPropagation()}>
              <div className="vehicle-history-header">
                <div>
                  <h3>Vehicle history</h3>
                  <p className="vehicle-history-vin">{selectedVin}</p>
                </div>
                <button type="button" className="close-modal-btn" onClick={() => setSelectedVin(null)} aria-label="Close history">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <VehicleTimeline
                vin={selectedVin}
                scans={state?.scans?.filter((s) => s.vin === selectedVin) || []}
              />
              {!readOnly && setState && (
                <div className="vehicle-history-delete">
                  <AdminVehicleDeleteButton
                    vin={selectedVin}
                    setState={setState}
                    onDeleted={() => setSelectedVin(null)}
                  />
                </div>
              )}
              {canMarkOut && setState && (
                <AdminOutForm
                  key={selectedVin}
                  vin={selectedVin}
                  yard={yard}
                  vehicle={selectedVehicle}
                  state={state}
                  setState={setState}
                  requisitions={state?.requisitions}
                  onDone={() => setSelectedVin(null)}
                />
              )}
            </div>
          </div>
        )}

        <footer className="modal-footer">
          <span className="modal-footer-note">
            {yardVehicles.length} vehicle{yardVehicles.length === 1 ? "" : "s"} at this yard
          </span>
          <div className="modal-footer-actions">
            <button
              type="button"
              className="yard-export-btn"
              disabled={yardVehicles.length === 0}
              onClick={() => exportYardVehiclesExcel(yard, yardVehicles, state?.flags || [])}
              title={yardVehicles.length === 0 ? "No vehicles to export" : "Download Excel of all vehicles in this yard"}
            >
              <span className="material-symbols-outlined">download</span>
              <span>Download Excel</span>
            </button>
            <button type="button" className="primary modal-done-btn" onClick={onClose}>Done</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
