import React, { useEffect, useState } from "react";
import { decodeVinDetails, updateVehicleDetails, findYardById, yardsByRegion } from "../stockyardLogic.js";
import { adminUpdateVehicle } from "../api.js";
import { AdminVehicleDeleteButton } from "./AdminVehicleDeleteButton.jsx";

const DRIVE_TYPES = [
  { value: "", label: "Not set" },
  { value: "neo_drive", label: "Neo Drive" },
  { value: "hybrid", label: "Hybrid" },
  { value: "petrol", label: "Petrol" },
  { value: "diesel", label: "Diesel" },
];

function getDerivedStatus(v) {
  if (v.currentStatus === "transit") return { label: "IN-TRANSIT", badgeClass: "badge-transit", value: "transit" };
  if (v.currentStatus === "in") return { label: "IN", badgeClass: "badge-in", value: "in" };
  if (v.currentStatus === "out" && v.outRemark === "stockyard_transfer") {
    return { label: "BRANCH TRANSFER", badgeClass: "badge-transfer", value: "out" };
  }
  if (v.currentStatus === "out") return { label: "OUT", badgeClass: "badge-out", value: "out" };
  return { label: "UNKNOWN", badgeClass: "badge-unknown", value: v.currentStatus || "out" };
}

function getYardName(yardId) {
  if (!yardId) return "—";
  const yardObj = findYardById(yardId);
  return yardObj ? `${yardObj.code} · ${yardObj.name}` : yardId;
}

function buildForm(vehicle) {
  const decoded = decodeVinDetails(vehicle.vin);
  return {
    model: vehicle.model && vehicle.model !== "Unknown" && vehicle.model !== "Toyota Vehicle"
      ? vehicle.model
      : decoded.model || "",
    variant: vehicle.variant && vehicle.variant !== "Standard" ? vehicle.variant : decoded.variant || "",
    colour: vehicle.colour && vehicle.colour !== "Not set" ? vehicle.colour : decoded.colour || "",
    driveType: vehicle.driveType || "",
    keyNo: vehicle.keyNo || "",
    status: vehicle.currentStatus === "transit" ? "transit" : vehicle.currentStatus === "in" ? "in" : "out",
    yardId: vehicle.currentYardId || "",
    vinValid: vehicle.vinValid !== false,
  };
}

export function AllVehiclesTab({ state, setState, initialEditVin, onInitialEditConsumed }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingVin, setEditingVin] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const allVehicles = state ? Object.values(state.vehicles) : [];
  const editingVehicle = editingVin ? state?.vehicles?.[editingVin] : null;

  useEffect(() => {
    if (!initialEditVin || !state?.vehicles?.[initialEditVin]) return;
    setEditingVin(initialEditVin);
    onInitialEditConsumed?.();
  }, [initialEditVin, state?.vehicles, onInitialEditConsumed]);

  useEffect(() => {
    if (!editingVehicle) {
      setForm(null);
      return;
    }
    setForm(buildForm(editingVehicle));
    setError("");
    setSuccess("");
  }, [editingVin, editingVehicle]);

  useEffect(() => {
    if (!editingVin) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e) => {
      if (e.key === "Escape") closeEditor();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [editingVin]);

  const filteredVehicles = allVehicles.filter((v) => {
    const derivedStatus = getDerivedStatus(v);
    const matchesStatus = statusFilter === "all" || derivedStatus.label === statusFilter;
    const decoded = decodeVinDetails(v.vin);
    const displayModel = v.model && v.model !== "Unknown" && v.model !== "Toyota Vehicle" ? v.model : decoded.model;
    const searchString = `${v.vin} ${displayModel} ${v.variant || ""} ${v.colour || ""} ${derivedStatus.label}`.toLowerCase();
    return matchesStatus && searchString.includes(searchQuery.toLowerCase());
  });

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError("");
    setSuccess("");
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!editingVin || !form) return;

    if (form.status === "in" && !form.yardId) {
      setError("Select a yard when status is IN.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const updated = await adminUpdateVehicle(editingVin, {
        model: form.model.trim(),
        variant: form.variant.trim() || null,
        colour: form.colour.trim() || null,
        drive_type: form.driveType || null,
        key_no: form.keyNo.trim() || null,
        status: form.status,
        yard_id: form.status === "in" || form.status === "transit" ? form.yardId || null : form.yardId || null,
        vin_valid: form.vinValid,
      });

      if (setState) {
        setState(
          updateVehicleDetails(state, editingVin, {
            model: updated.model || form.model.trim(),
            variant: updated.variant || form.variant.trim() || "",
            colour: updated.colour || form.colour.trim() || "",
            driveType: updated.drive_type || form.driveType || "",
            keyNo: updated.key_no || form.keyNo.trim() || "",
            currentStatus: updated.current_status || form.status,
            currentYardId: updated.current_yard_id || form.yardId || null,
            vinValid: updated.vin_valid ?? form.vinValid,
            lastChangedAt: updated.last_changed_at || new Date().toISOString(),
          })
        );
      }

      setSuccess("Vehicle saved.");
    } catch (err) {
      setError(err.message || "Could not save vehicle.");
    } finally {
      setSaving(false);
    }
  }

  function closeEditor() {
    setEditingVin(null);
    setForm(null);
    setError("");
    setSuccess("");
  }

  return (
    <div className="tab-pane vehicle-edit-workspace">
      <div className="tab-summary">
        <strong>All vehicles</strong>
        <span className="tab-summary-hint">
          {filteredVehicles.length} shown · {allVehicles.length} total · tap a row to edit
        </span>
      </div>

      <div className="controls-row">
        <div className="search-row inline-search">
          <span className="material-symbols-outlined">search</span>
          <input
            type="text"
            placeholder="Search VIN or model…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search vehicles"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
          <option value="all">All statuses</option>
          <option value="IN-TRANSIT">In transit</option>
          <option value="IN">In</option>
          <option value="BRANCH TRANSFER">Branch transfer</option>
          <option value="OUT">Out</option>
        </select>
      </div>

      {editingVin && form && (
        <div className="modal-overlay" onClick={closeEditor} aria-modal="true" role="dialog" aria-labelledby="vehicle-edit-title">
          <form
            className="modal-content vehicle-edit-modal-card"
            onSubmit={handleSave}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="vehicle-edit-panel-header">
              <div>
                <p className="vehicle-edit-kicker">Editing vehicle</p>
                <h3 id="vehicle-edit-title" className="vehicle-edit-vin">{editingVin}</h3>
              </div>
              <button type="button" className="close-modal-btn" onClick={closeEditor} aria-label="Close editor">
                <span className="material-symbols-outlined">close</span>
              </button>
            </header>

            <div className="vehicle-edit-modal-body">
              <div className="vehicle-edit-grid">
            <label className="vehicle-edit-field">
              <span>Model</span>
              <input
                value={form.model}
                onChange={(e) => updateField("model", e.target.value)}
                required
                placeholder="e.g. Toyota Hyryder"
              />
            </label>

            <label className="vehicle-edit-field">
              <span>Variant</span>
              <input
                value={form.variant}
                onChange={(e) => updateField("variant", e.target.value)}
                placeholder="e.g. Hybrid · 2026 MY"
              />
            </label>

            <label className="vehicle-edit-field">
              <span>Colour</span>
              <input
                value={form.colour}
                onChange={(e) => updateField("colour", e.target.value)}
                placeholder="Colour or plant note"
              />
            </label>

            <label className="vehicle-edit-field">
              <span>Drive type</span>
              <select value={form.driveType} onChange={(e) => updateField("driveType", e.target.value)}>
                {DRIVE_TYPES.map((opt) => (
                  <option key={opt.value || "none"} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>

            <label className="vehicle-edit-field">
              <span>Key No.</span>
              <input
                value={form.keyNo}
                onChange={(e) => updateField("keyNo", e.target.value)}
                placeholder="Optional, e.g. K-101"
              />
            </label>

            <label className="vehicle-edit-field">
              <span>Status</span>
              <select value={form.status} onChange={(e) => updateField("status", e.target.value)}>
                <option value="in">IN</option>
                <option value="out">OUT</option>
                <option value="transit">In transit</option>
              </select>
            </label>

            <label className="vehicle-edit-field vehicle-edit-field-wide">
              <span>Yard</span>
              <select
                value={form.yardId}
                onChange={(e) => updateField("yardId", e.target.value)}
                required={form.status === "in"}
              >
                <option value="">No yard / clear</option>
                {yardsByRegion().map(({ region, yards: regionYards }) => (
                  <optgroup key={region} label={region}>
                    {regionYards.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.code} · {y.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <label className="vehicle-edit-check">
              <input
                type="checkbox"
                checked={form.vinValid}
                onChange={(e) => updateField("vinValid", e.target.checked)}
              />
              <span>VIN marked valid</span>
            </label>
              </div>

              {error && <p className="notice bad">{error}</p>}
              {success && <p className="notice ok">{success}</p>}
            </div>

            <footer className="vehicle-edit-actions">
              {setState && (
                <AdminVehicleDeleteButton
                  vin={editingVin}
                  setState={setState}
                  onDeleted={closeEditor}
                />
              )}
              <div className="vehicle-edit-actions-main">
                <button type="button" className="cred-modal-cancel" onClick={closeEditor}>
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={saving || !form.model.trim()}>
                  {saving ? "Saving…" : "Save vehicle"}
                </button>
              </div>
            </footer>
          </form>
        </div>
      )}

      <div className="table-wrapper">
        <table className="data-table vehicle-edit-table">
          <thead>
            <tr>
              <th>VIN</th>
              <th>Model</th>
              <th>Key No</th>
              <th>Status</th>
              <th>Yard</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {filteredVehicles.length === 0 ? (
              <tr>
                <td colSpan="6" className="empty-state-cell">
                  {allVehicles.length === 0
                    ? "No vehicles in the system yet."
                    : "No vehicles match this search or filter."}
                </td>
              </tr>
            ) : (
              filteredVehicles.map((v) => {
                const derivedStatus = getDerivedStatus(v);
                const isActive = editingVin === v.vin;
                return (
                  <tr
                    key={v.vin}
                    className={isActive ? "vehicle-row-active" : "vehicle-row-clickable"}
                    onClick={() => setEditingVin(v.vin)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setEditingVin(v.vin);
                      }
                    }}
                  >
                    <td className="mono">{v.vin}</td>
                    <td>{v.model}</td>
                    <td className="mono">{v.keyNo || "—"}</td>
                    <td>
                      <span className={`status-badge ${derivedStatus.badgeClass}`}>
                        {derivedStatus.label}
                      </span>
                    </td>
                    <td className="yard-cell">{getYardName(v.currentYardId)}</td>
                    <td className="time-cell">
                      {v.lastChangedAt
                        ? new Date(v.lastChangedAt).toLocaleString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
