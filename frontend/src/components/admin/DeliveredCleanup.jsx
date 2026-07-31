import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { parseDeliveredVins, removeDeliveredVehicles } from "../../stockyardLogic.js";
import { deliverVehicles } from "../../api.js";
import { ConfirmDialog } from "../ConfirmDialog.jsx";

export function DeliveredCleanup({ state, setState, onSuccess, onError }) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("ok");
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const vins = useMemo(() => parseDeliveredVins(text), [text]);
  const liveMatches = vins.filter((vin) => state.vehicles[vin]);
  const unmatched = vins.length - liveMatches.length;

  function upload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (file.name.toLowerCase().endsWith(".xlsx")) {
        const workbook = XLSX.read(reader.result, { type: "array" });
        setText(workbook.SheetNames.map((name) => XLSX.utils.sheet_to_csv(workbook.Sheets[name])).join("\n"));
        return;
      }
      setText(String(reader.result || ""));
    };
    if (file.name.toLowerCase().endsWith(".xlsx")) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  }

  function requestSubmit(event) {
    event.preventDefault();
    if (!liveMatches.length) {
      setMessageTone("warn");
      setMessage("No matching live vehicles found. Nothing will be removed.");
      return;
    }
    setConfirmOpen(true);
  }

  async function applyRemoval() {
    setLoading(true);
    try {
      await deliverVehicles(liveMatches);
      setState(removeDeliveredVehicles(state, vins));
      const msg = `Removed ${liveMatches.length} delivered vehicle${liveMatches.length === 1 ? "" : "s"} from live stock.`;
      setMessageTone("ok");
      setMessage(msg);
      setText("");
      onSuccess?.(msg);
      setConfirmOpen(false);
    } catch (err) {
      const msg = `Could not sync: ${err.message}`;
      setMessageTone("bad");
      setMessage(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form className="stack admin-tool-form" onSubmit={requestSubmit}>
        <p className="field-hint">Paste or upload VINs already delivered to customers. Matching vehicles are removed from live stock.</p>
        <label htmlFor="delivered-file">Excel / CSV file (optional)</label>
        <input id="delivered-file" type="file" accept=".xlsx,.csv,.txt" onChange={upload} />
        <label htmlFor="delivered-vins">VIN list</label>
        <textarea
          id="delivered-vins"
          rows="6"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Paste VINs, one per line or from an Excel column"
        />
        <div className="delivered-counts">
          <span>
            <b>{vins.length}</b> VINs parsed
          </span>
          <span>
            <b>{liveMatches.length}</b> in live stock
          </span>
          {unmatched > 0 && (
            <span className="delivered-unmatched">
              <b>{unmatched}</b> not in stock
            </span>
          )}
        </div>
        {liveMatches.length > 0 && (
          <div className="notice warn" role="status">
            Confirming will permanently remove {liveMatches.length} vehicle{liveMatches.length === 1 ? "" : "s"} from live stock.
          </div>
        )}
        <button className="primary" disabled={!vins.length || loading || liveMatches.length === 0}>
          {loading ? "Removing…" : `Remove ${liveMatches.length || 0} from live stock`}
        </button>
        {message && <p className={`notice ${messageTone}`}>{message}</p>}
      </form>

      <ConfirmDialog
        open={confirmOpen}
        title="Remove delivered vehicles?"
        message={
          <>
            <p>
              Remove {liveMatches.length} live vehicle{liveMatches.length === 1 ? "" : "s"} from stock?
            </p>
            {unmatched > 0 && (
              <p className="field-hint">
                {unmatched} VIN{unmatched === 1 ? "" : "s"} in the list are not in live stock and will be ignored.
              </p>
            )}
            <p className="field-hint">This cannot be undone from this screen.</p>
          </>
        }
        confirmLabel={`Remove ${liveMatches.length}`}
        tone="danger"
        loading={loading}
        onConfirm={applyRemoval}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
