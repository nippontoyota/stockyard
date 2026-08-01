import React, { useState } from "react";
import { deleteAdminVehicle } from "../api.js";
import { removeVehicleFromState } from "../stockyardLogic.js";
import { ConfirmDialog } from "./ConfirmDialog.jsx";

export function AdminVehicleDeleteButton({
  vin,
  setState,
  onDeleted,
  className = "danger-btn ghost admin-vehicle-delete-btn",
  label = "Delete vehicle",
  compact = false,
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setLoading(true);
    setError("");
    try {
      await deleteAdminVehicle(vin);
      if (setState) {
        setState((current) => removeVehicleFromState(current, vin));
      }
      setConfirmOpen(false);
      onDeleted?.();
    } catch (err) {
      setError(err.message || "Could not delete vehicle.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setConfirmOpen(true)}
        disabled={loading}
        title={compact ? label : undefined}
      >
        {compact ? <span className="material-symbols-outlined" aria-hidden="true">delete</span> : label}
      </button>
      {error && !confirmOpen && <p className="notice bad">{error}</p>}
      <ConfirmDialog
        open={confirmOpen}
        title="Delete vehicle?"
        message={
          <>
            <p>Permanently remove <strong>{vin}</strong> and all scan history, flags, and requisitions for this VIN.</p>
            <p>This cannot be undone.</p>
            {error && confirmOpen && <p className="notice bad">{error}</p>}
          </>
        }
        confirmLabel="Delete"
        tone="danger"
        loading={loading}
        onConfirm={handleDelete}
        onCancel={() => {
          if (!loading) {
            setError("");
            setConfirmOpen(false);
          }
        }}
      />
    </>
  );
}
