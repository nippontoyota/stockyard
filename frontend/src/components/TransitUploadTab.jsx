import React, { useState } from "react";
import * as XLSX from "xlsx";
import { yards, yardsByRegion, normalizeVin, isValidVin, detectModel } from "../stockyardLogic.js";
import { uploadTransitListApi } from "../api.js";
import { ConfirmDialog } from "./ConfirmDialog.jsx";

export function TransitUploadTab({ onUploadComplete }) {
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function findYard(value) {
    if (!value) return null;
    const search = String(value).toLowerCase().trim();
    const byId = yards.find((y) => y.id.toLowerCase() === search);
    if (byId) return byId;
    const byExactName = yards.find((y) => y.name.toLowerCase() === search);
    if (byExactName) return byExactName;
    const byPartialName = yards.find((y) => y.name.toLowerCase().includes(search));
    if (byPartialName) return byPartialName;
    // Codes are shared across sites — only accept when exactly one match
    const byCode = yards.filter((y) => y.code.toLowerCase() === search);
    if (byCode.length === 1) return byCode[0];
    return null;
  }

  function handleFileDrop(e) {
    e.preventDefault();
    const droppedFile = e.dataTransfer ? e.dataTransfer.files[0] : e.target.files[0];
    if (!droppedFile) return;

    setFile(droppedFile);
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

        if (rows.length < 2) throw new Error("File is empty or missing headers.");

        const headers = rows[0].map((h) => String(h).toLowerCase().trim());
        const vinCol = headers.findIndex((h) => h.includes("vin"));
        const modelCol = headers.findIndex((h) => h.includes("model"));
        const yardCol = headers.findIndex((h) => h.includes("yard") || h.includes("destination") || h.includes("location"));

        if (vinCol === -1) throw new Error("Could not find a VIN column.");

        const extracted = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !row[vinCol]) continue;

          const rawVin = String(row[vinCol]);
          const normalizedVin = normalizeVin(rawVin);
          if (!normalizedVin || !isValidVin(normalizedVin)) continue;

          const rawYard = yardCol !== -1 ? row[yardCol] : null;
          const matchedYard = findYard(rawYard);
          const rawModel = modelCol !== -1 ? row[modelCol] : detectModel(normalizedVin);

          extracted.push({
            vin: normalizedVin,
            model: rawModel || detectModel(normalizedVin),
            yard_id: matchedYard?.id || null,
            yardCode: matchedYard?.code || "",
            yardName: matchedYard?.name || "",
            rawYard: rawYard ? String(rawYard) : "",
            unmatched: !matchedYard,
          });
        }

        if (extracted.length === 0) {
          throw new Error("No valid VINs found in this file.");
        }

        setParsedData(extracted);
      } catch (err) {
        setError(err.message || "Failed to parse the Excel file.");
      } finally {
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(droppedFile);
  }

  const unmatchedCount = parsedData.filter((v) => v.unmatched).length;
  const readyCount = parsedData.length - unmatchedCount;

  function updateRowYard(vin, yardId) {
    const yard = yards.find((y) => y.id === yardId);
    setParsedData((prev) =>
      prev.map((row) =>
        row.vin === vin
          ? {
              ...row,
              yard_id: yard?.id || null,
              yardCode: yard?.code || "",
              yardName: yard?.name || "",
              unmatched: !yard,
            }
          : row
      )
    );
  }

  function requestConfirm() {
    if (readyCount === 0) return;
    if (unmatchedCount > 0) {
      setConfirmOpen(true);
      return;
    }
    handleConfirm();
  }

  async function handleConfirm() {
    if (readyCount === 0) return;

    const payload = parsedData.filter((v) => v.yard_id).map(({ vin, model, yard_id }) => ({ vin, model, yard_id }));
    setLoading(true);
    setError(null);
    try {
      const response = await uploadTransitListApi(payload);
      setSuccessMsg(response.message || `Uploaded ${payload.length} vehicles as in transit.`);
      setParsedData([]);
      setFile(null);
      setConfirmOpen(false);
      if (onUploadComplete) onUploadComplete();
    } catch (err) {
      setError("Upload failed: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel stack transit-upload-panel">
      <h2>Upload transit list</h2>
      <p className="field-hint">
        Excel from TKM with <strong>VIN</strong>, optional <strong>Model</strong>, and <strong>Destination / Yard</strong> columns.
      </p>

      {!parsedData.length && (
        <div
          className="upload-dropzone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
          onClick={() => document.getElementById("transit-file").click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") document.getElementById("transit-file").click();
          }}
        >
          <span className="material-symbols-outlined upload-dropzone-icon">upload_file</span>
          <strong>{loading ? "Reading file…" : "Drop Excel here or click to browse"}</strong>
          <p className="field-hint">{file ? file.name : ".xlsx / .xls"}</p>
          <input
            id="transit-file"
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileDrop}
            hidden
          />
        </div>
      )}

      {error && (
        <div className="notice warn">
          <strong>Could not import:</strong> {error}
        </div>
      )}

      {successMsg && (
        <div className="notice ok">
          <strong>Done:</strong> {successMsg}
        </div>
      )}

      {parsedData.length > 0 && (
        <div className="transit-preview stack">
          <div className="transit-preview-header">
            <div>
              <h3>{parsedData.length} vehicles found</h3>
              <p className="field-hint">
                {readyCount} ready
                {unmatchedCount > 0 ? ` · ${unmatchedCount} need a yard` : ""}
              </p>
            </div>
            <button type="button" className="ghost" onClick={() => { setParsedData([]); setFile(null); }} disabled={loading}>
              Cancel
            </button>
          </div>

          {unmatchedCount > 0 && (
            <div className="notice warn">
              Rows highlighted below have no matched yard. Pick a destination before uploading, or they will be skipped.
            </div>
          )}

          <div className="table-wrapper transit-preview-table">
            <table className="damaged-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>VIN</th>
                  <th>Model</th>
                  <th>Destination yard</th>
                </tr>
              </thead>
              <tbody>
                {parsedData.map((v, i) => (
                  <tr key={v.vin} className={v.unmatched ? "row-unmatched" : ""}>
                    <td className="muted-cell">{i + 1}</td>
                    <td className="damaged-vin">{v.vin}</td>
                    <td>{v.model}</td>
                    <td>
                      <select
                        className={`yard-pick ${v.unmatched ? "yard-pick-warn" : ""}`}
                        value={v.yard_id || ""}
                        onChange={(e) => updateRowYard(v.vin, e.target.value)}
                        aria-label={`Destination yard for ${v.vin}`}
                      >
                        <option value="">
                          {v.rawYard ? `Unmatched: ${v.rawYard}` : "Select yard…"}
                        </option>
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            className="primary"
            onClick={requestConfirm}
            disabled={loading || readyCount === 0}
          >
            {loading ? "Uploading…" : `Confirm ${readyCount} in transit`}
            <span className="material-symbols-outlined">cloud_upload</span>
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Upload with unmatched rows?"
        message={
          <>
            <p>
              {unmatchedCount} row{unmatchedCount === 1 ? "" : "s"} still have no yard.
            </p>
            <p>
              Upload the {readyCount} matched vehicle{readyCount === 1 ? "" : "s"} and skip the rest?
            </p>
          </>
        }
        confirmLabel={`Upload ${readyCount}`}
        loading={loading}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </section>
  );
}
