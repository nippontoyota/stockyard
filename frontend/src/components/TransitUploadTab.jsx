import React, { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { yards, normalizeVin, isValidVin, detectModel } from "../stockyardLogic.js";
import { uploadTransitListApi } from "../api.js";

export function TransitUploadTab({ onUploadComplete }) {
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Fuzzy match yard by name or code
  function findYard(value) {
    if (!value) return null;
    const search = String(value).toLowerCase().trim();
    return yards.find(
      (y) => y.code.toLowerCase() === search || y.name.toLowerCase().includes(search)
    );
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
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        // Extract raw JSON (array of arrays)
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
        
        if (rows.length < 2) throw new Error("File is empty or missing headers.");

        const headers = rows[0].map(h => String(h).toLowerCase().trim());
        const vinCol = headers.findIndex(h => h.includes("vin"));
        const modelCol = headers.findIndex(h => h.includes("model"));
        const yardCol = headers.findIndex(h => h.includes("yard") || h.includes("destination") || h.includes("location"));

        if (vinCol === -1) throw new Error("Could not find a 'VIN' column.");
        
        const extracted = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !row[vinCol]) continue;
          
          const rawVin = String(row[vinCol]);
          const normalizedVin = normalizeVin(rawVin);
          if (!normalizedVin || !isValidVin(normalizedVin)) continue;

          const rawYard = yardCol !== -1 ? row[yardCol] : null;
          const matchedYard = findYard(rawYard) || yards[0]; // fallback to first yard if not found
          
          const rawModel = modelCol !== -1 ? row[modelCol] : detectModel(normalizedVin);

          extracted.push({
            vin: normalizedVin,
            model: rawModel || detectModel(normalizedVin),
            yardId: matchedYard.id,
            yardCode: matchedYard.code,
            yardName: matchedYard.name
          });
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

  async function handleConfirm() {
    if (parsedData.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const payload = parsedData.map(v => ({ vin: v.vin, model: v.model, yard_id: v.yardId }));
      const response = await uploadTransitListApi(payload);
      setSuccessMsg(response.message || "Transit list uploaded successfully.");
      setParsedData([]);
      setFile(null);
      if (onUploadComplete) onUploadComplete();
    } catch (err) {
      setError("Failed to upload: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel stack transit-upload-panel">
      <h2>Upload Transit List</h2>
      <p className="field-hint" style={{ marginBottom: "1rem" }}>
        Upload an Excel file (.xlsx) from TKM containing <strong>VIN</strong>, <strong>Model</strong>, and <strong>Destination</strong> columns.
      </p>

      {!parsedData.length && (
        <div
          className="upload-dropzone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
          style={{
            border: "2px dashed var(--border)",
            borderRadius: "12px",
            padding: "3rem",
            textAlign: "center",
            cursor: "pointer",
            background: "var(--surface)",
            transition: "all 0.2s ease"
          }}
          onClick={() => document.getElementById("transit-file").click()}
        >
          <span className="material-symbols-outlined" style={{ fontSize: "3rem", color: "var(--text-dim)", marginBottom: "1rem" }}>upload_file</span>
          <br />
          <strong>Drag & drop your Excel file here</strong>
          <p className="field-hint">or click to browse</p>
          <input
            id="transit-file"
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileDrop}
            style={{ display: "none" }}
          />
        </div>
      )}

      {error && (
        <div className="notice warn">
          <strong>Error:</strong> {error}
        </div>
      )}

      {successMsg && (
        <div className="notice ok">
          <strong>Success:</strong> {successMsg}
        </div>
      )}

      {parsedData.length > 0 && (
        <div className="transit-preview stack">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3>Preview: {parsedData.length} Vehicles Detected</h3>
            <button className="ghost" onClick={() => setParsedData([])} disabled={loading}>
              Cancel
            </button>
          </div>
          
          <div className="table-wrapper" style={{ maxHeight: "400px", overflowY: "auto", border: "1px solid var(--border)", borderRadius: "8px" }}>
            <table className="damaged-table">
              <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                <tr>
                  <th>#</th>
                  <th>VIN</th>
                  <th>Model</th>
                  <th>Destination Yard</th>
                </tr>
              </thead>
              <tbody>
                {parsedData.map((v, i) => (
                  <tr key={v.vin}>
                    <td style={{ color: "var(--text-dim)" }}>{i + 1}</td>
                    <td style={{ fontFamily: "monospace" }}>{v.vin}</td>
                    <td>{v.model}</td>
                    <td>
                      <span className="scan-badge in">{v.yardCode}</span> {v.yardName}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button className="primary" onClick={handleConfirm} disabled={loading} style={{ alignSelf: "flex-end", marginTop: "1rem" }}>
            {loading ? "Uploading..." : "Confirm Transit List"}
            <span className="material-symbols-outlined">cloud_upload</span>
          </button>
        </div>
      )}
    </section>
  );
}
