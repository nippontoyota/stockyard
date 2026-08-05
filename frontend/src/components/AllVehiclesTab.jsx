import React, { useEffect, useState } from "react";
import {
  updateVehicleDetails,
  renameVehicleVin,
  resolveFlagsByVin,
  findYardById,
  yardsByRegion,
  isValidVin,
  DRIVE_TYPES,
  entryMethodLabel,
} from "../stockyardLogic.js";
import { adminUpdateVehicle } from "../api.js";
import { AdminVehicleDeleteButton } from "./AdminVehicleDeleteButton.jsx";

const DRIVE_TYPE_OPTIONS = [
  { value: "", label: "Not set" },
  ...DRIVE_TYPES,
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

function normalizeFormVin(value) {
  return String(value || "").trim().toUpperCase();
}

function buildForm(vehicle) {
  return {
    vin: vehicle.vin || "",
    model: vehicle.model || "",
    driveType: vehicle.driveType || "",
    keyNo: vehicle.keyNo || "",
    status: vehicle.currentStatus === "transit" ? "transit" : vehicle.currentStatus === "in" ? "in" : "out",
    yardId: vehicle.currentYardId || "",
    vinValid: vehicle.vinValid !== false,
  };
}

function saveErrorMessage(err) {
  if (err?.status === 409) return "That VIN already exists on another vehicle.";
  if (err?.status === 400) return "Invalid VIN format.";
  return err?.message || "Could not save vehicle.";
}

export function AllVehiclesTab({ state, setState, initialEditVin, onInitialEditConsumed, toast }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingVin, setEditingVin] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmVin, setConfirmVin] = useState(null);
  const [confirmRetype, setConfirmRetype] = useState("");

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
    setConfirmVin(null);
    setConfirmRetype("");
  }, [editingVin, editingVehicle]);

  useEffect(() => {
    if (!editingVin) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        if (confirmVin) {
          setConfirmVin(null);
          setConfirmRetype("");
          return;
        }
        closeEditor();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [editingVin, confirmVin]);

  const filteredVehicles = allVehicles.filter((v) => {
    const derivedStatus = getDerivedStatus(v);
    const matchesStatus = statusFilter === "all" || derivedStatus.label === statusFilter;
    const searchString = `${v.vin} ${v.model || ""} ${derivedStatus.label}`.toLowerCase();
    return matchesStatus && searchString.includes(searchQuery.toLowerCase());
  });

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError("");
    setSuccess("");
  }

  async function persistVehicle(nextVin) {
    if (!editingVin || !form) return;

    setSaving(true);
    setError("");
    setSuccess("");

    const vinChanged = nextVin !== editingVin;
    const payload = {
      model: form.model.trim(),
      drive_type: form.driveType || null,
      key_no: form.keyNo.trim() || null,
      status: form.status,
      yard_id: form.status === "in" || form.status === "transit" ? form.yardId || null : form.yardId || null,
      vin_valid: vinChanged ? true : form.vinValid,
    };
    if (vinChanged) payload.vin = nextVin;

    try {
      const updated = await adminUpdateVehicle(editingVin, payload);
      const savedVin = normalizeFormVin(updated.vin || nextVin);
      const detailsPatch = {
        model: updated.model || form.model.trim(),
        driveType: updated.drive_type || form.driveType || "",
        keyNo: updated.key_no || form.keyNo.trim() || "",
        currentStatus: updated.current_status || form.status,
        currentYardId: updated.current_yard_id || form.yardId || null,
        vinValid: updated.vin_valid ?? (vinChanged ? true : form.vinValid),
        lastChangedAt: updated.last_changed_at || new Date().toISOString(),
      };

      if (setState) {
        let nextState = vinChanged
          ? renameVehicleVin(state, editingVin, savedVin, detailsPatch)
          : updateVehicleDetails(state, editingVin, detailsPatch);
        // Auto-resolve all open flags for this vehicle (backend does the same)
        nextState = resolveFlagsByVin(nextState, savedVin);
        setState(nextState);
      }

      if (vinChanged) {
        setEditingVin(savedVin);
        setForm((prev) => (prev ? { ...prev, vin: savedVin, vinValid: true } : prev));
        setSuccess(`VIN updated to ${savedVin}.`);
      } else {
        setSuccess("Vehicle saved.");
      }
      setConfirmVin(null);
      setConfirmRetype("");

      // Show success toast and auto-close editor
      if (toast) toast("Vehicle reviewed successfully!");
      setTimeout(() => closeEditor(), 1200);
    } catch (err) {
      setError(saveErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function handleSave(event) {
    event.preventDefault();
    if (!editingVin || !form) return;

    if (form.status === "in" && !form.yardId) {
      setError("Select a yard when status is IN.");
      return;
    }

    const nextVin = normalizeFormVin(form.vin);
    if (!isValidVin(nextVin)) {
      setError("VIN must be 17 characters (letters/numbers, no I, O, or Q).");
      return;
    }

    if (nextVin !== editingVin) {
      setConfirmVin(nextVin);
      setConfirmRetype("");
      setError("");
      setSuccess("");
      return;
    }

    void persistVehicle(nextVin);
  }

  function handleConfirmRename(event) {
    event.preventDefault();
    if (!confirmVin) return;
    if (normalizeFormVin(confirmRetype) !== confirmVin) {
      setError("Retyped VIN does not match. Please type the new VIN exactly.");
      return;
    }
    void persistVehicle(confirmVin);
  }

  function closeEditor() {
    setEditingVin(null);
    setForm(null);
    setError("");
    setSuccess("");
    setConfirmVin(null);
    setConfirmRetype("");
  }

  const confirmMatches = confirmVin && normalizeFormVin(confirmRetype) === confirmVin;

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
            onSubmit={confirmVin ? handleConfirmRename : handleSave}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="vehicle-edit-panel-header">
              <div>
                <p className="vehicle-edit-kicker">{confirmVin ? "Confirm VIN change" : "Editing vehicle"}</p>
                <h3 id="vehicle-edit-title" className="vehicle-edit-vin">{editingVin}</h3>
                {!confirmVin && entryMethodLabel(editingVehicle?.entryMethod) ? (
                  <p className="field-hint">{entryMethodLabel(editingVehicle.entryMethod)}</p>
                ) : null}
              </div>
              <button type="button" className="close-modal-btn" onClick={closeEditor} aria-label="Close editor">
                <span className="material-symbols-outlined">close</span>
              </button>
            </header>

            <div className="vehicle-edit-modal-body">
              {confirmVin ? (
                <div className="vehicle-vin-confirm">
                  <p className="vehicle-vin-confirm-copy">
                    Change VIN from <span className="mono">{editingVin}</span> to{" "}
                    <span className="mono">{confirmVin}</span>?
                  </p>
                  <p className="vehicle-vin-confirm-hint">
                    History stays on this vehicle. Retype the new VIN to confirm.
                  </p>
                  <label className="vehicle-edit-field vehicle-edit-field-wide">
                    <span>Retype new VIN</span>
                    <input
                      value={confirmRetype}
                      onChange={(e) => {
                        setConfirmRetype(e.target.value);
                        setError("");
                      }}
                      autoFocus
                      autoCapitalize="characters"
                      spellCheck={false}
                      placeholder={confirmVin}
                      aria-label="Retype new VIN to confirm"
                    />
                  </label>
                </div>
              ) : (
                <div className="vehicle-edit-grid">
                  <label className="vehicle-edit-field vehicle-edit-field-wide">
                    <span>VIN</span>
                    <input
                      value={form.vin}
                      onChange={(e) => updateField("vin", e.target.value.toUpperCase())}
                      required
                      autoCapitalize="characters"
                      spellCheck={false}
                      placeholder="17-character VIN"
                      aria-label="Vehicle VIN"
                    />
                    {normalizeFormVin(form.vin) !== editingVin && (
                      <span className="vehicle-edit-vin-original">Original: {editingVin}</span>
                    )}
                  </label>

                  <label className="vehicle-edit-field">
                    <span>Model</span>
                    <input
                      value={form.model}
                      onChange={(e) => updateField("model", e.target.value)}
                      required
                      placeholder="e.g. Innova HyCross"
                    />
                  </label>

                  <label className="vehicle-edit-field">
                    <span>Drive type</span>
                    <select value={form.driveType} onChange={(e) => updateField("driveType", e.target.value)}>
                      {DRIVE_TYPE_OPTIONS.map((opt) => (
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
              )}

              {error && <p className="notice bad">{error}</p>}
              {success && <p className="notice ok">{success}</p>}
            </div>

            <footer className="vehicle-edit-actions">
              {!confirmVin && setState && (
                <AdminVehicleDeleteButton
                  vin={editingVin}
                  setState={setState}
                  onDeleted={closeEditor}
                />
              )}
              <div className="vehicle-edit-actions-main">
                {confirmVin ? (
                  <>
                    <button
                      type="button"
                      className="cred-modal-cancel"
                      onClick={() => {
                        setConfirmVin(null);
                        setConfirmRetype("");
                        setError("");
                      }}
                      disabled={saving}
                    >
                      Back
                    </button>
                    <button type="submit" className="primary" disabled={saving || !confirmMatches}>
                      {saving ? "Saving…" : "Confirm VIN change"}
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="cred-modal-cancel" onClick={closeEditor}>
                      Cancel
                    </button>
                    <button type="submit" className="primary" disabled={saving || !form.model.trim()}>
                      {saving ? "Saving…" : "Save vehicle"}
                    </button>
                  </>
                )}
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
              <th>Entry</th>
              <th>Status</th>
              <th>Yard</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {filteredVehicles.length === 0 ? (
              <tr>
                <td colSpan="7" className="empty-state-cell">
                  {allVehicles.length === 0
                    ? "No vehicles in the system yet."
                    : "No vehicles match this search or filter."}
                </td>
              </tr>
            ) : (
              filteredVehicles.map((v) => {
                const derivedStatus = getDerivedStatus(v);
                const isActive = editingVin === v.vin;
                const entryLabel = entryMethodLabel(v.entryMethod);
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
                    <td>{entryLabel || "—"}</td>
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
