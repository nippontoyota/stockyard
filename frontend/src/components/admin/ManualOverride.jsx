import React, { useState } from "react";
import { yards, yardsByRegion, updateVehicleAdmin } from "../../stockyardLogic.js";
import { adminOverrideVehicle } from "../../api.js";
import { ConfirmDialog } from "../ConfirmDialog.jsx";

export function ManualOverride({ state, setState, onSuccess, onError }) {
  const [vin, setVin] = useState("");
  const [yardId, setYardId] = useState(yards[0]?.id || "");
  const [status, setStatus] = useState("out");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const selectedYard = yards.find((y) => y.id === yardId);
  const consequence =
    status === "out"
      ? `Marks ${vin || "this VIN"} as OUT and clears its current yard.`
      : `Marks ${vin || "this VIN"} as IN at ${selectedYard ? `${selectedYard.code} · ${selectedYard.name}` : "the selected yard"}.`;

  function requestSubmit(event) {
    event.preventDefault();
    setFormError("");
    if (!vin.trim() || !reason.trim()) return;
    setConfirmOpen(true);
  }

  async function applyOverride() {
    setLoading(true);
    try {
      const targetVin = vin;
      await adminOverrideVehicle(targetVin, status, reason, status === "in" ? yardId : null);
      setState(updateVehicleAdmin(state, { vin: targetVin, yardId, status, reason }));
      setVin("");
      setReason("");
      onSuccess?.(status === "out" ? `Forced OUT for ${targetVin}.` : `Set IN at ${selectedYard?.code || yardId} for ${targetVin}.`);
      setConfirmOpen(false);
    } catch (err) {
      const msg = err.message || "Override failed.";
      setFormError(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form className="stack admin-tool-form" onSubmit={requestSubmit}>
        <p className="field-hint">Use only when a physical scan failed. Every change is audited with your note.</p>
        <label htmlFor="override-vin">VIN</label>
        <input
          id="override-vin"
          required
          value={vin}
          onChange={(event) => setVin(event.target.value.toUpperCase())}
          placeholder="17-character VIN"
          autoComplete="off"
          spellCheck={false}
        />
        <label htmlFor="override-status">What should happen?</label>
        <select id="override-status" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="out">Force close — mark vehicle OUT</option>
          <option value="in">Reassign — mark vehicle IN at a yard</option>
        </select>
        {status === "in" && (
          <>
            <label htmlFor="override-yard">Destination yard</label>
            <select id="override-yard" value={yardId} onChange={(event) => setYardId(event.target.value)} required>
              {yardsByRegion().map(({ region, yards: regionYards }) => (
                <optgroup key={region} label={region}>
                  {regionYards.map((yard) => (
                    <option value={yard.id} key={yard.id}>
                      {yard.code} · {yard.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </>
        )}
        <label htmlFor="override-reason">Why are you changing this?</label>
        <textarea
          id="override-reason"
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="e.g. Vehicle left without OUT scan — confirmed with yard supervisor"
          rows={3}
        />
        <div className="notice info" role="status">
          <strong>Result:</strong> {consequence}
        </div>
      {formError && <p className="notice bad">{formError}</p>}
        <button className="primary" disabled={loading || !vin.trim() || !reason.trim()}>
          {loading ? "Applying…" : status === "out" ? "Force close OUT" : "Reassign as IN"}
        </button>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        title={status === "out" ? "Force close OUT?" : "Reassign as IN?"}
        message={
          <>
            <p>{consequence}</p>
            <p className="field-hint">This is logged as a manual admin override.</p>
          </>
        }
        confirmLabel={status === "out" ? "Force close OUT" : "Reassign as IN"}
        tone="danger"
        loading={loading}
        onConfirm={applyOverride}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
